import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, beforeEach, mock, test } from "node:test";

const home = await mkdtemp(join(tmpdir(), "aeko-shop-oauth-test-"));
const os = createRequire(import.meta.url)("node:os");
const homedir = mock.method(os, "homedir", () => home);
syncBuiltinESMExports();
const { setToken, getToken, clearToken } = await import("../dist/shared/token-store.js");
homedir.mock.restore();
syncBuiltinESMExports();
const { requireAccessToken } = await import("../dist/shared/oauth.js");
const { AekoApiClient } = await import("../dist/shared/api-client.js");
const { ApiError, AuthRequiredError } = await import("../dist/shared/errors.js");

after(async () => { await rm(home, { recursive: true, force: true }); });
beforeEach(async () => {
  await clearToken("brand");
  await clearToken("personal");
  delete process.env.AEKO_SHOP_AUTH_CODE;
  delete process.env.BRAND_CONNECTION_TOKEN;
});

function record(expiresInSeconds) {
  return {
    client_id: "test-client",
    access_token: "old-access",
    refresh_token: "old-refresh",
    expires_at: Date.now() + expiresInSeconds * 1000,
  };
}

function rotatedToken() {
  return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
}

test("refreshes the returning brand session once for concurrent near-expiry requests", async t => {
  await setToken("brand", record(20));
  const fetch = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.match(String(url), /\/oauth\/token$/);
    assert.equal(init.body.get("grant_type"), "refresh_token");
    assert.equal(init.body.get("refresh_token"), "old-refresh");
    return rotatedToken();
  });

  assert.deepEqual(await Promise.all([requireAccessToken("brand"), requireAccessToken("brand")]), [
    "new-access", "new-access",
  ]);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal((await getToken("brand")).refresh_token, "new-refresh");
});

test("keeps the refresh credential after a temporary provider failure", async t => {
  await setToken("personal", record(-1));
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    new Response(null, { status: 503, headers: { "Retry-After": "1" } }),
  );

  await assert.rejects(requireAccessToken("personal"), error =>
    error instanceof ApiError && error.status === 503 && error.retryAfter === "1",
  );
  assert.equal((await getToken("personal")).refresh_token, "old-refresh");
  fetch.mock.mockImplementation(async () => rotatedToken());
  assert.equal(await requireAccessToken("personal"), "new-access");
});

test("keeps the stored refresh token when a success response contains a malformed rotation", async t => {
  await setToken("personal", record(-1));
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ access_token: "new-access", refresh_token: "", expires_in: 3600 }),
  );

  await assert.rejects(requireAccessToken("personal"), error => error instanceof ApiError && error.status === 502);
  assert.equal((await getToken("personal")).refresh_token, "old-refresh");
});

test("requests reauthorization after a definitive grant rejection", async t => {
  await setToken("brand", record(-1));
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "invalid refresh token" }, { status: 400 }));

  await assert.rejects(requireAccessToken("brand"), AuthRequiredError);
  const saved = await getToken("brand");
  assert.equal(saved.refresh_token, undefined);
  assert.ok(saved.pkce_verifier);
});

test("concurrent definitive rejections share a usable PKCE challenge", async t => {
  await setToken("brand", record(-1));
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: "invalid refresh token" }, { status: 400 }),
  );

  const results = await Promise.allSettled([requireAccessToken("brand"), requireAccessToken("brand")]);
  const verifier = (await getToken("brand")).pkce_verifier;
  const expected = createHash("sha256").update(verifier).digest("base64url");
  for (const result of results) {
    assert.equal(result.status, "rejected");
    assert.ok(result.reason instanceof AuthRequiredError);
    assert.equal(new URL(result.reason.authorizeUrl).searchParams.get("code_challenge"), expected);
  }
  assert.equal(fetch.mock.callCount(), 1);
});

test("registers again when the old client is gone and exchanges the new code", async t => {
  await setToken("brand", record(-1));
  const requestedGrants = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).endsWith("/oauth/register")) {
      requestedGrants.push("register");
      return Response.json({ client_id: "new-client" });
    }
    const grant = init.body.get("grant_type");
    requestedGrants.push(grant);
    if (grant === "refresh_token") {
      assert.equal(init.body.get("client_id"), "test-client");
      return Response.json({ detail: "unknown client_id" }, { status: 400 });
    }
    assert.equal(init.body.get("client_id"), "new-client");
    assert.equal(init.body.get("code"), "fake-new-code");
    return rotatedToken();
  });

  await assert.rejects(requireAccessToken("brand"), error => {
    assert.ok(error instanceof AuthRequiredError);
    assert.equal(new URL(error.authorizeUrl).searchParams.get("client_id"), "new-client");
    return true;
  });
  assert.equal((await getToken("brand")).refresh_token, undefined);
  process.env.AEKO_SHOP_AUTH_CODE = "fake-new-code";
  assert.equal(await requireAccessToken("brand"), "new-access");
  assert.deepEqual(requestedGrants, ["refresh_token", "register", "authorization_code"]);
});

test("serializes rotating refreshes across two independent stdio processes", { timeout: 10_000 }, async t => {
  await setToken("brand", record(-1));
  await setToken("personal", { client_id: "other-profile" });
  const workerScript = `
    import { createRequire, syncBuiltinESMExports } from "node:module";
    import { createInterface } from "node:readline";
    const require = createRequire(import.meta.url);
    require("node:os").homedir = () => process.env.AEKO_TEST_TOKEN_DIR;
    syncBuiltinESMExports();
    const lockfile = require("proper-lockfile");
    const lock = lockfile.lock;
    lockfile.lock = (...args) => {
      console.log("locking");
      return lock(...args);
    };
    const { requireAccessToken } = await import(${JSON.stringify(new URL("../dist/shared/oauth.js", import.meta.url).href)});
    globalThis.fetch = async (url, init) => {
      if (!String(url).endsWith("/oauth/token")) throw new Error("Unexpected request");
      console.log("refresh:" + init.body.get("refresh_token"));
      const input = createInterface({ input: process.stdin });
      for await (const line of input) {
        input.close();
        return Response.json({ access_token: "new-access", refresh_token: line, expires_in: 3600 });
      }
      throw new Error("Missing mock response");
    };
    console.log("result:" + await requireAccessToken("brand"));
  `;
  function startWorker() {
    const child = spawn(process.execPath, ["--input-type=module", "-e", workerScript], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, AEKO_TEST_TOKEN_DIR: home },
    });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    return {
      child,
      lines: createInterface({ input: child.stdout })[Symbol.asyncIterator](),
      exit: once(child, "exit"),
    };
  }

  const first = startWorker();
  assert.equal((await first.lines.next()).value, "locking");
  assert.equal((await first.lines.next()).value, "refresh:old-refresh");
  const second = startWorker();
  assert.equal((await second.lines.next()).value, "locking");
  first.child.stdin.end("new-refresh\n");
  assert.equal((await first.lines.next()).value, "result:new-access");
  // A second provider request would produce a "refresh:" line, not this result.
  assert.equal((await second.lines.next()).value, "result:new-access");
  assert.deepEqual(await Promise.all([first.exit, second.exit]), [[0, null], [0, null]]);
  assert.equal((await getToken("brand")).refresh_token, "new-refresh");
  assert.equal((await getToken("personal")).client_id, "other-profile");
});

test("replays concurrent API 401 responses with the same rotated access token", async t => {
  await setToken("personal", record(3600));
  let oldRequests = 0;
  let releaseOldRequests;
  const oldResponses = new Promise(resolve => { releaseOldRequests = resolve; });
  let refreshes = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).endsWith("/oauth/token")) {
      refreshes += 1;
      return rotatedToken();
    }
    if (init.headers.get("authorization") === "Bearer old-access") {
      if (++oldRequests === 2) releaseOldRequests();
      await oldResponses;
      return new Response(null, { status: 401 });
    }
    assert.equal(init.headers.get("authorization"), "Bearer new-access");
    return Response.json({ ok: true });
  });

  const client = new AekoApiClient("personal");
  assert.deepEqual(await Promise.all([client.request("/one"), client.request("/two")]), [
    { ok: true }, { ok: true },
  ]);
  assert.equal(refreshes, 1);
});
