# aeko-shop-mcp — Agent Guide

npm MCP package (`aeko-shop-mcp` v0.1.0, registry name `io.github.aeko-intelligence/aeko-shop-mcp`) connecting AI assistants to AEKO Shop. One CLI (`dist/cli.js`, `src/cli.ts`) dispatches on its first argument to one of two **stdio-only** server profiles, both talking to `https://api.aeko.shop`:

- **`personal`** (`src/personal/server.ts`, 18 tools) — personal shopper. Anonymous reads (work before OAuth): `catalog.search`, `catalog.get_brand`, `catalog.get_product`, `community.list_threads`, `community.get_thread`. OAuth-gated: `cart.create` / `cart.add_item` / `cart.remove_item` / `order.draft` (`orders:draft`); `community.ask` / `community.reply` (`community:write`, disclosed agent-authored); `community.inbox` / `community.inbox_mark_read` (`community:read`); `preferences.follow_brand` / `unfollow_brand` / `list_follows` (`preferences:write`); `self.get`; `self.disconnect` (`self:manage`). Scopes requested: `catalog:read`, `community:read`, `community:write`, `preferences:write`, `orders:draft`, `self:manage`.
- **`brand`** (`src/brand/server.ts`, 13 tools) — verified brand agent. `brand.self`; `brand.profile.update` (`brand:profile:write`, tri-state field writes, vertical is a z.enum synced with backend `BrandVertical`); `brand.orders.list_pending` / `get` / `accept` / `reject` / `mark_shipped` / `mark_delivered` (`brand:orders:manage`); `brand.community.reply` (`community:write`, answer shopper questions as the brand) + `brand.community.get_thread` (anonymous); `brand.inbox` / `brand.inbox_mark_read` (`community:read` — reviews imported, AI mentions updated, thread activity); `brand.self.disconnect` (`self:manage`). Scopes requested: `brand:profile:write`, `brand:orders:manage`, `community:read`, `community:write`, `self:manage`.

## Auth & state

- OAuth 2.1 + PKCE (`src/shared/oauth.ts`); redirect URI `http://localhost:8787/callback` with manual code-paste in v0.1 (no local listener).
- Tokens persist at `~/.aeko-shop-mcp/tokens.json` (file 0600, dir 0700), one record per profile (`src/shared/token-store.ts`). Auto-refresh within 30 s of expiry; 401 triggers refresh-and-retry (`src/shared/api-client.ts`).
- Env vars: `AEKO_SHOP_AUTH_CODE` (one-time bootstrap code, secret), `BRAND_CONNECTION_TOKEN` (one-time 5-min brand binding token, secret), `AEKO_SHOP_API_BASE` (default `https://api.aeko.shop`), `AEKO_SHOP_FRONTEND_BASE` (default `https://aeko.shop`).
- Scope lists live in `src/shared/config.ts` and must stay in sync with the backend's `SHOPPER_AGENT_SCOPES` / `BRAND_AGENT_SCOPES` (aeko-shop backend `schemas.py`).

## Dev workflow

```sh
npm install
npm run build       # tsc → dist/
npm run typecheck   # tsc --noEmit
node dist/cli.js personal   # smoke test (boots stdio MCP server; also: brand)
```

- No test script defined. Node >= 20. Deps: `@modelcontextprotocol/sdk`, `zod`.
- Local staging: `AEKO_SHOP_API_BASE=http://localhost:8000 AEKO_SHOP_FRONTEND_BASE=http://localhost:3000 node dist/cli.js personal`.
- Release: push a semver tag to `main`; the npm-publish workflow builds, checks tag == `package.json#version`, publishes with provenance.

## Relationship to aeko-mcp

Different product, different backend: `../aeko-mcp` is the Python streamable-http MCP for the AEKO Intelligence AEO platform; this package is the TypeScript stdio MCP for AEKO Shop commerce. No shared code or tokens — a client can load both side by side.

## Where to look

- `README.md` — per-client install, first-run OAuth walkthrough, brand verification setup, tool tables, rate limits, token storage.
- `server.json` — MCP Registry publishing metadata.
- `src/shared/` — oauth, token store, API client, scopes/config, error shaping.

---
Workspace catalog: `/Users/seanhan/aeko-intelligence/AGENTS.md` · Canonical docs: `/Users/seanhan/aeko-intelligence/aeko-agents/docs/`
