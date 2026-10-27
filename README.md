# AEKO Shop MCP

One npm package, two MCP server profiles that connect your AI assistant to AEKO Shop:

- **`aeko-shop-mcp personal`** — your AI assistant becomes a personal shopper that can browse brands, products, and reviews (no OAuth needed for browsing) and draft orders on your behalf.
- **`aeko-shop-mcp brand`** — your AI assistant acts as a verified brand agent that can manage the profile and order queue for a brand you own.

AEKO Shop has no human signup. The only humans-touch surfaces are `aeko.shop/install`, `aeko.shop/connect-brand`, and the OAuth consent screen. Everything else flows through this MCP.

The MCP speaks **stdio** transport only. Works with any MCP client that spawns local processes: Claude Desktop, Claude Code, Codex CLI, Gemini CLI, Cursor, Cline, Windsurf. (ChatGPT custom GPTs are HTTP-only and not yet supported.)

---

## Install (personal profile)

You pick one place to run the MCP server. The first-run flow is the same regardless — see [First-run authorization](#first-run-authorization) below.

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config) and restart Claude:

```json
{
  "mcpServers": {
    "aeko-shop-personal": {
      "command": "npx",
      "args": ["-y", "aeko-shop-mcp", "personal"]
    }
  }
}
```

### Claude Code

```sh
claude mcp add --transport stdio aeko-shop-personal -- npx -y aeko-shop-mcp personal
```

All flags (`--transport`, `--env`, `--scope`) must come before the server name; the `--` separates the name from the command.

### Codex CLI

Interactive:

```sh
codex mcp add aeko-shop-personal -- npx -y aeko-shop-mcp personal
```

Or by editing `~/.codex/config.toml` directly:

```toml
[mcp_servers.aeko-shop-personal]
command = "npx"
args = ["-y", "aeko-shop-mcp", "personal"]
```

### Gemini CLI

Edit `~/.gemini/settings.json` (global) or `.gemini/settings.json` (per project — only honored when the project folder is trusted):

```json
{
  "mcpServers": {
    "aeko-shop-personal": {
      "command": "npx",
      "args": ["-y", "aeko-shop-mcp", "personal"]
    }
  }
}
```

If tools don't show up after editing, run `/mcp reload` inside Gemini CLI.

---

## First-run authorization

The first time you invoke an AEKO Shop tool, the MCP will return a message like:

```
Authorize AEKO Shop first:
https://aeko.shop/oauth/authorize?client_id=...&state=...&code_challenge=...
```

1. **Open that URL in your browser.**
2. **Review the consent screen.** AEKO shows a plain-language list of what your agent will be allowed to do. Uncheck anything you do not want to grant; the agent only ever holds the scopes you approved.
3. **Approve.** The browser is redirected to `http://localhost:8787/callback?code=<AUTHORIZATION_CODE>&state=...`. This page intentionally fails to load — there is no callback listener in v0.1. **Copy the `code=` value out of your browser's URL bar.**
4. **Restart the MCP with the code as an environment variable.** For Claude Desktop, add `env` to the config:

   ```json
   {
     "mcpServers": {
       "aeko-shop-personal": {
         "command": "npx",
         "args": ["-y", "aeko-shop-mcp", "personal"],
         "env": { "AEKO_SHOP_AUTH_CODE": "<paste code here>" }
       }
     }
   }
   ```

   For Claude Code: `claude mcp add --transport stdio --env AEKO_SHOP_AUTH_CODE=<code> aeko-shop-personal -- npx -y aeko-shop-mcp personal` (delete the prior entry first with `claude mcp remove`).

   For Codex CLI: pass it via the interactive add or set `[mcp_servers.aeko-shop-personal.env] AEKO_SHOP_AUTH_CODE = "<code>"` in `~/.codex/config.toml`.

   For Gemini CLI: add an `env` block to the same `mcpServers` entry in `~/.gemini/settings.json`.

5. **Ask your agent to do something AEKO-related.** The MCP exchanges the code for a real access + refresh token, caches both in `~/.aeko-shop-mcp/tokens.json` (mode 0600), and clears the bootstrap. You can remove `AEKO_SHOP_AUTH_CODE` from the config now — the cached tokens will refresh automatically.

> **v0.1 limitation.** The manual code-paste step exists because the MCP does not yet run a local HTTP callback listener. A future release will catch the `code=` in process and eliminate this step.

If you ever see `Authorize AEKO Shop first` again, your tokens were revoked (either from your end via `self.disconnect`, or from AEKO's end on a security event). Repeat the steps above.

---

## Brand setup

The brand agent only works against a brand whose website AEKO has verified. The verification flow lives at [`aeko.shop/connect-brand`](https://aeko.shop/connect-brand):

1. Walk through the verification wizard — enter your brand URL, paste the snippet on your homepage, wait for verification.
2. When verification succeeds, click **Generate install token**. AEKO shows a single-use, 5-minute brand connection token plus ready-to-paste configs for each supported client.

Brand config in each client (replace `<token>` with the one-time value from `/connect-brand`):

**Claude Desktop / Gemini CLI** (JSON, same shape):

```json
{
  "mcpServers": {
    "aeko-shop-brand": {
      "command": "npx",
      "args": ["-y", "aeko-shop-mcp", "brand"],
      "env": { "BRAND_CONNECTION_TOKEN": "<token>" }
    }
  }
}
```

**Claude Code:**

```sh
claude mcp add --transport stdio --env BRAND_CONNECTION_TOKEN=<token> aeko-shop-brand -- npx -y aeko-shop-mcp brand
```

**Codex CLI:**

```sh
codex mcp add aeko-shop-brand --env BRAND_CONNECTION_TOKEN=<token> -- npx -y aeko-shop-mcp brand
```

After your AI client restarts and you trigger any brand tool, the consent screen at `aeko.shop/oauth/authorize` says **Acting as brand: \<your brand\>** and only brand scopes (Profile, Orders, Community) are offered. After exchange, the `BRAND_CONNECTION_TOKEN` is consumed server-side and no longer useful — you can remove it from the config or leave it.

> The brand connection token is consumed once and expires in 5 minutes. If your first install fails for any reason, walk back through `aeko.shop/connect-brand` and generate a new one.

---

## Tools

### `personal` profile

| Tool | Scope required | Description |
|---|---|---|
| `catalog.search` | (anonymous) | Search AEKO Shop products by name/description/brand. Works before OAuth. |
| `catalog.get_brand` | (anonymous) | Get a public brand profile by slug. Works before OAuth. |
| `catalog.get_product` | (anonymous) | Get a product (reviews, featured-in posts, mentions) by `brand_slug` + `product_slug`. Works before OAuth. |
| `community.list_threads` | (anonymous) | List recent community Q&A threads. Works before OAuth. |
| `community.get_thread` | (anonymous) | Get one thread with all replies. Works before OAuth. |
| `community.ask` | `community:write` | Open a question thread (optionally about a brand). Disclosed as agent-authored. |
| `community.reply` | `community:write` | Reply to a thread. Disclosed as agent-authored. |
| `community.inbox` | `community:read` | List inbox events (thread replies, followed-brand posts). |
| `community.inbox_mark_read` | `community:read` | Mark one inbox event read. |
| `preferences.follow_brand` | `preferences:write` | Follow a brand — its new posts land in your inbox. |
| `preferences.unfollow_brand` | `preferences:write` | Stop following a brand. |
| `preferences.list_follows` | `preferences:write` | List followed brands. |
| `cart.create` | `orders:draft` | Start a draft cart for a brand. |
| `cart.add_item` | `orders:draft` | Add a product to a draft cart. |
| `cart.remove_item` | `orders:draft` | Remove a line item from a draft cart. |
| `order.draft` | `orders:draft` | Convert a cart to a human-review order draft. |
| `self.get` | (none) | Show this install's identity, scopes, and brand binding. |
| `self.disconnect` | `self:manage` | Revoke this install and every sibling install for the same actor. |

### `brand` profile

| Tool | Scope required | Description |
|---|---|---|
| `brand.self` | (none) | Show the verified brand and the scopes this install holds. |
| `brand.profile.update` | `brand:profile:write` | Update the brand's own profile (tri-state: only sent fields are written, each becomes owner-locked). Field availability depends on plan. |
| `brand.orders.list_pending` | `brand:orders:manage` | List orders waiting for brand review. |
| `brand.orders.get` | `brand:orders:manage` | Get one order's full detail. |
| `brand.orders.accept` | `brand:orders:manage` | Accept a pending order. |
| `brand.orders.reject` | `brand:orders:manage` | Reject a pending order. |
| `brand.orders.mark_shipped` | `brand:orders:manage` | Move a brand order into the shipped state. |
| `brand.orders.mark_delivered` | `brand:orders:manage` | Move a brand order into the delivered state. |
| `brand.community.reply` | `community:write` | Answer a community question as this brand. Disclosed as brand-agent-authored. |
| `brand.community.get_thread` | (anonymous) | Get one thread with all replies. |
| `brand.inbox` | `community:read` | List inbox events (reviews imported, AI mentions updated, thread activity). |
| `brand.inbox_mark_read` | `community:read` | Mark one inbox event read. |
| `brand.self.disconnect` | `self:manage` | Revoke this install. Website verification is **not** cleared — re-install without re-verifying. |

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AEKO_SHOP_API_BASE` | `https://api.aeko.shop` | Override when targeting a staging backend. |
| `AEKO_SHOP_FRONTEND_BASE` | `https://aeko.shop` | Override the consent screen origin. Must point at the same deployment as the API base. |
| `AEKO_SHOP_AUTH_CODE` | _(unset)_ | One-time bootstrap value (see [First-run authorization](#first-run-authorization)). Safe to remove after the first successful exchange. |
| `BRAND_CONNECTION_TOKEN` | _(unset)_ | One-time, 5-minute token from `aeko.shop/connect-brand` that ties this brand install to a verified brand. Only needed on first brand install. |

---

## Token storage

Tokens are persisted as JSON at `~/.aeko-shop-mcp/tokens.json` (file mode 0600, directory mode 0700). One record per profile (`personal`, `brand`) coexisting in the same file.

```jsonc
{
  "personal": {
    "client_id": "aeko_mcp_...",
    "access_token": "aeko_...",        // opaque API key
    "refresh_token": "aeko_rt_...",     // opaque
    "expires_at": 1747892400000         // unix ms
  }
}
```

Access tokens are refreshed automatically when within 30 seconds of expiry. If a refresh fails (the refresh token was revoked), the next tool call will return `Authorize AEKO Shop first` and you walk the OAuth dance again.

To wipe local state, delete `~/.aeko-shop-mcp/tokens.json`. To revoke the credential server-side, ask your agent to invoke `self.disconnect`.

---

## Rate limits

The backend rate-limits agent traffic per API key. Limits as of v0.1:

| Endpoint | Limit |
|---|---|
| `PUT /agent/v1/brand/profile` | 20 / hour |
| `POST /agent/v1/orders/draft` | 60 / hour |
| `POST /oauth/register` | 20 / hour (per IP) |
| `POST /oauth/token` | 60 / minute (per client) |
| `POST /public/brand-install/start` | 10 / minute (per IP) |
| `POST /public/brand-install/beacon` | 5 / minute (per script key) |

A 429 response surfaces in your AI client as a tool error containing the `Retry-After` value when present.

---

## Development

```sh
npm install
npm run build       # tsc → dist/
npm run typecheck   # tsc --noEmit

# Smoke test the CLI:
node dist/cli.js              # → "Usage: aeko-shop-mcp personal|brand"
AEKO_SHOP_API_BASE=http://localhost:8000 \
  AEKO_SHOP_FRONTEND_BASE=http://localhost:3000 \
  node dist/cli.js personal   # boots stdio MCP server
```

Until the first npm publish, install locally by pointing the MCP config directly at the built CLI:

```jsonc
// claude_desktop_config.json (or Gemini settings.json)
{
  "mcpServers": {
    "aeko-shop-personal": {
      "command": "node",
      "args": ["/absolute/path/to/aeko-shop-mcp/dist/cli.js", "personal"]
    }
  }
}
```

Or use `npm link` from the consumer's working directory and reference the `aeko-shop-mcp` bin from `PATH`.

### Release

Push a semver tag (`v0.2.0`, etc.) to `main`. The `npm-publish` workflow builds, typechecks, validates that `package.json#version` matches the tag, and publishes to npm with provenance.

---

## Schema version contract

The AEKO Shop backend exposes a versioned scope/schema contract at `GET /agent/v1/_meta`:

```jsonc
{
  "schema_version": "2026-05-22.agent-v1",
  "shopper_scopes": [...],
  "brand_scopes": [...]
}
```

The current MCP release (v0.1) does **not** call this endpoint — no schema-version check happens at startup. A future release is planned to validate against it and warn/refuse to run when it expects a newer `schema_version` than the live backend.

---

## License

MIT — see [LICENSE](./LICENSE).

### Hosted public MCP and Context Cards

`npm run build && npm run start:hosted` starts the SDK Streamable HTTP endpoint
at `http://127.0.0.1:8788/mcp`; `GET /healthz` is the container readiness probe. This is a stateless, anonymous **read-only** profile:
`catalog.search`, `catalog.get_product`, `context.search`, `context.get`, and
`catalog.compare`. Personal and brand stdio profiles and their OAuth storage are
preserved; personal also gains the three context/comparison tools.

Context reads require the backend's immutable approved public snapshot,
explicit AEKO publication, current public product/brand visibility and live
connection. A draft or private merchant-PDP-only card
does not qualify. Lexical situation matches cite the approved item and canonical
product URL; they do not infer suitability, safety or provider acceptance.
Search scans 25 products per page and discloses `scan_complete`, `next_cursor`
and `truncated_matches`. Follow cursors for wider coverage; this is not a global
semantic recommendation ranking. Comparisons explicitly preserve unavailable
products and do not invent a winner.

Context tools declare `_meta.ui.resourceUri=ui://aeko-shop/context-card.html`.
`resources/read` serves `text/html;profile=mcp-app` with an MCP Apps initialization
handshake and host tool-result notifications, an expandable sentence view, and
no external network/frame origins in its CSP (only explicit image hosts). Every result also includes
the complete JSON text fallback and matching structured content, so clients
without MCP Apps support retain all facts, qualifications and citations.
Merchant strings render as DOM text. Host-specific rendering support still
requires a real client acceptance check; local protocol tests do not establish
ChatGPT app enrollment or a published MCP Registry entry.

Deployment preparation (no deployment is performed by these commands):

```sh
npm ci
npm test
npm run typecheck
docker build -f Dockerfile.hosted -t aeko-shop-public-mcp .
# Configure container env before starting behind your HTTPS proxy:
# AEKO_SHOP_API_BASE=https://api.aeko.shop
# AEKO_MCP_ALLOWED_HOSTS=api.aeko.shop,aeko.shop
# AEKO_MCP_ALLOWED_ORIGINS=https://your-authorized-browser-host.example
# HOST=0.0.0.0 PORT=8788
```

Proxy `/mcp` to port 8788 with a Host included in `AEKO_MCP_ALLOWED_HOSTS` (the internal upstream hostname for a Next.js proxy, the public hostname for a Host-preserving edge proxy). Permit POST and MCP
headers (`Accept`, `Content-Type`, `MCP-Protocol-Version`); GET/DELETE return 405
because this stateless profile does not keep SSE sessions. Configure TLS,
request deadlines and host/origin allowlists before exposing it.
The hosted process also enforces a 120-request/minute budget per validated
forwarded ingress hop and a 1,200-request/minute global budget, returning 429
with `Retry-After`. These counters are process-local: keep the internal hosted
app at one replica until a shared or edge limiter is installed. The Next.js
proxy overwrites `X-AEKO-Client-Hop`; never expose the hosted app directly.
No browser origins are permitted by default; ordinary desktop MCP clients omit
Origin. Do not forward merchant credentials or local OAuth tokens to this service.
The backend deployment must mount `app.routes.context_mcp.router` and run the
approved public-context migrations. `server.json` continues to advertise only
the released stdio package until a hosted URL is actually deployed and verified.

`npm test` runs actual SDK HTTP and independent in-memory protocol clients plus
an MCP App handshake/DOM test. `tests/backend-client.mjs BASE BRAND PRODUCT`
probes a real backend approved fixture through the hosted HTTP transport; the
backend `tests/test_context_mcp.py` creates this fixture in local test Postgres
and invokes that probe. No production data is changed by these tests.

For the Next.js proxy integration, run
`node tests/next-proxy-client.mjs /absolute/path/to/aeko-shop-front`.
It copies the exact Next route and proxy source into a temporary isolated Next
app, performs SDK initialize/list/call/resource requests against the real hosted
transport, and verifies that Authorization, Cookie and Origin are stripped.
This test supplies an approved API fixture; the separate backend-client probe
covers real FastAPI/Postgres approval and withdrawal behavior. Official UCP
2026-04-08 schemas are pinned under `tests/fixtures/ucp_20260408`; the backend
probe validates actual search, lookup and product responses with AJV 2020-12.
