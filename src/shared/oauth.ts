import { createHash, randomBytes } from "node:crypto";
import { API_BASE, FRONTEND_BASE, type Profile, scopesFor } from "./config.js";
import { ApiError, AuthRequiredError } from "./errors.js";
import { getToken, withTokenStore, type TokenRecord } from "./token-store.js";

const OAUTH_TIMEOUT_MS = 20_000;

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pkceChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

async function register(profile: Profile): Promise<TokenRecord> {
  const scopes = scopesFor(profile);
  const response = await fetch(`${API_BASE}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: profile === "brand" ? "AEKO Brand Agent" : "AEKO Personal Shopper",
      redirect_uris: ["http://localhost:8787/callback"],
      scope: scopes.join(" "),
    }),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OAuth registration failed: ${response.status}`);
  const body = (await response.json().catch(() => null)) as { client_id?: unknown } | null;
  if (typeof body?.client_id !== "string" || !body.client_id) {
    throw new ApiError(502, "AEKO Shop returned an invalid OAuth client registration.");
  }
  return { client_id: body.client_id };
}

function authorizationUrl(profile: Profile, clientId: string, verifier: string): string {
  const scopes = scopesFor(profile);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "http://localhost:8787/callback",
    response_type: "code",
    scope: scopes.join(" "),
    state: base64Url(randomBytes(18)),
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  const brandConnectionToken = process.env.BRAND_CONNECTION_TOKEN;
  if (profile === "brand" && brandConnectionToken) params.set("brand_connection_token", brandConnectionToken);
  return `${FRONTEND_BASE}/oauth/authorize?${params.toString()}`;
}

export async function requireAccessToken(profile: Profile, rejectedAccessToken?: string): Promise<string> {
  const saved = usableAccessToken(await getToken(profile));
  if (saved && saved !== rejectedAccessToken) return saved;

  return withTokenStore(profile, async (stored, save) => {
    const current = usableAccessToken(stored);
    if (current && current !== rejectedAccessToken) return current;

    let record = stored;
    if (record?.refresh_token) {
      const response = await requestToken({
        grant_type: "refresh_token",
        client_id: record.client_id,
        refresh_token: record.refresh_token,
      });
      if (response.ok) {
        const refreshed = await parseToken(response, record.client_id, record.refresh_token);
        await save(refreshed);
        return refreshed.access_token;
      }
      const failure = await grantFailure(response);
      if (!failure) {
        throw new ApiError(response.status, "Could not refresh the AEKO Shop session. Try again.", response.headers.get("retry-after"));
      }
      record = failure === "client" ? undefined : { client_id: record.client_id, pkce_verifier: record.pkce_verifier };
      await save(record);
    }

    const code = process.env.AEKO_SHOP_AUTH_CODE;
    if (record?.pkce_verifier && code) {
      const response = await requestToken({
        grant_type: "authorization_code",
        client_id: record.client_id,
        redirect_uri: "http://localhost:8787/callback",
        code,
        code_verifier: record.pkce_verifier,
      });
      if (response.ok) {
        const authorized = await parseToken(response, record.client_id);
        await save(authorized);
        return authorized.access_token;
      }
      const failure = await grantFailure(response);
      if (!failure) {
        throw new ApiError(response.status, "Could not authorize the AEKO Shop session. Try again.", response.headers.get("retry-after"));
      }
      if (failure === "client") {
        record = undefined;
        await save();
      }
    }

    record ??= await register(profile);
    // Reuse an unfinished challenge across concurrent prompts. Only a
    // completed exchange replaces the verifier, so either consent URL works.
    const verifier = record.pkce_verifier ?? base64Url(randomBytes(32));
    if (!record.pkce_verifier) await save({ ...record, pkce_verifier: verifier });
    throw new AuthRequiredError(authorizationUrl(profile, record.client_id, verifier));
  });
}

function requestToken(fields: Record<string, string>): Promise<Response> {
  return fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
}

async function grantFailure(response: Response): Promise<"client" | "grant" | undefined> {
  if (response.status !== 400 && response.status !== 401) return undefined;
  const failure = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
  if (failure?.error === "invalid_client" || (response.status === 400 && failure?.detail === "unknown client_id")) {
    return "client";
  }
  if (response.status === 400 && (
    failure?.error === "invalid_grant"
    || failure?.detail === "invalid refresh token"
    || failure?.detail === "invalid authorization code"
    || failure?.detail === "invalid code_verifier"
  )) return "grant";
}

async function parseToken(
  response: Response, clientId: string, previousRefresh?: string,
): Promise<TokenRecord & { access_token: string }> {
  const body = (await response.json().catch(() => null)) as
    { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown } | null;
  if (typeof body?.access_token !== "string" || !body.access_token
    || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0
    || (body.refresh_token != null && (typeof body.refresh_token !== "string" || !body.refresh_token))) {
    throw new ApiError(502, "AEKO Shop returned an invalid OAuth token response.");
  }
  return {
    client_id: clientId,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? previousRefresh,
    expires_at: Date.now() + body.expires_in * 1000,
  };
}

function usableAccessToken(token: TokenRecord | undefined): string | null {
  return token?.access_token && (token.expires_at ?? 0) > Date.now() + 30_000
    ? token.access_token
    : null;
}
