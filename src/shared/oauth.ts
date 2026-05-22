import { createHash, randomBytes } from "node:crypto";
import { API_BASE, FRONTEND_BASE, type Profile, scopesFor } from "./config.js";
import { AuthRequiredError } from "./errors.js";
import { getToken, setToken, type TokenRecord } from "./token-store.js";

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
  });
  if (!response.ok) throw new Error(`OAuth registration failed: ${response.status}`);
  const body = (await response.json()) as { client_id: string };
  const record = { client_id: body.client_id };
  await setToken(profile, record);
  return record;
}

export async function authorizationUrl(profile: Profile): Promise<string> {
  const record = (await getToken(profile)) ?? (await register(profile));
  const verifier = base64Url(randomBytes(32));
  const scopes = scopesFor(profile);
  const params = new URLSearchParams({
    client_id: record.client_id,
    redirect_uri: "http://localhost:8787/callback",
    response_type: "code",
    scope: scopes.join(" "),
    state: base64Url(randomBytes(18)),
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  const brandConnectionToken = process.env.BRAND_CONNECTION_TOKEN;
  if (profile === "brand" && brandConnectionToken) params.set("brand_connection_token", brandConnectionToken);
  await setToken(profile, { ...record, pkce_verifier: verifier } as TokenRecord);
  return `${FRONTEND_BASE}/oauth/authorize?${params.toString()}`;
}

export async function requireAccessToken(profile: Profile): Promise<string> {
  const token = await getToken(profile);
  if (token?.access_token && token.expires_at && token.expires_at > Date.now() + 30_000) return token.access_token;
  const code = process.env.AEKO_SHOP_AUTH_CODE;
  if (token?.pkce_verifier && code) return exchangeAuthorizationCode(profile, token, code);
  throw new AuthRequiredError(await authorizationUrl(profile));
}

async function exchangeAuthorizationCode(profile: Profile, token: TokenRecord, code: string): Promise<string> {
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: token.client_id,
      redirect_uri: "http://localhost:8787/callback",
      code,
      code_verifier: token.pkce_verifier ?? "",
    }),
  });
  if (!response.ok) throw new AuthRequiredError(await authorizationUrl(profile));
  const body = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  await setToken(profile, {
    client_id: token.client_id,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  });
  return body.access_token;
}

export async function refreshAccessToken(profile: Profile): Promise<string | null> {
  const token = await getToken(profile);
  if (!token?.refresh_token) return null;
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: token.client_id,
      refresh_token: token.refresh_token,
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  await setToken(profile, {
    ...token,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  });
  return body.access_token;
}
