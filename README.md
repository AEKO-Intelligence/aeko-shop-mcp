# AEKO Shop MCP

One npm package, two MCP server profiles that connect your AI assistant to AEKO Shop:

- **`aeko-shop-mcp personal`** — your AI assistant becomes a personal shopper that can browse brands, save preferences, and draft orders on your behalf.
- **`aeko-shop-mcp brand`** — your AI assistant acts as a verified brand agent that can update Featured Products, Hot Deals, and the order queue for a brand you own.

AEKO Shop has no human signup. The only humans-touch surfaces are `aeko.shop/install`, `aeko.shop/connect-brand`, and the OAuth consent screen. Everything else flows through this MCP.

---

## Install

You pick one of three places to run the MCP server. The recommended path is Claude Desktop.

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

For the brand profile, see [Brand setup](#brand-setup) below — it needs an extra one-time token.

### Codex CLI

Add to your Codex MCP config:

```toml
[mcp_servers.aeko-shop-personal]
command = "npx"
args = ["-y", "aeko-shop-mcp", "personal"]
```

### ChatGPT custom GPT

Create a custom GPT with a Custom MCP action and set the command to:

```sh
npx -y aeko-shop-mcp personal
```

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

5. **Ask your agent to do something AEKO-related.** The MCP exchanges the code for a real access + refresh token, caches both in `~/.aeko-shop-mcp/tokens.json` (mode 0600), and clears the bootstrap. You can remove `AEKO_SHOP_AUTH_CODE` from the config now — the cached tokens will refresh automatically.

> **v0.1 limitation.** The manual code-paste step exists because the MCP does not yet run a local HTTP callback listener. A future release will catch the `code=` in process and eliminate this step.

If you ever see `Authorize AEKO Shop first` again, your tokens were revoked (either from your end via `self.disconnect`, or from AEKO's end on a security event). Repeat the steps above.

---

## Brand setup

The brand agent only works against a brand whose website AEKO has verified. The verification flow lives at [`aeko.shop/connect-brand`](https://aeko.shop/connect-brand):

1. Walk through the verification wizard — enter your brand URL, paste the snippet on your homepage, wait for verification.
2. When verification succeeds, click **Generate install token**. AEKO shows you a single-use, 5-minute brand connection token plus a ready-to-paste Claude Desktop config:

   ```json
   {
     "mcpServers": {
       "aeko-shop-brand": {
         "command": "npx",
         "args": ["-y", "aeko-shop-mcp", "brand"],
         "env": { "BRAND_CONNECTION_TOKEN": "<one-time token>" }
       }
     }
   }
   ```

3. Paste into your AI client config and restart it. The first tool call walks the OAuth dance just like the personal flow above. The consent screen says **Acting as brand: \<your brand\>** and only the brand scopes (Featured, Hot Deals, Orders) are offered.
4. After exchange, the `BRAND_CONNECTION_TOKEN` is consumed and no longer useful — you can remove it from the config or leave it (it's been invalidated server-side).

> The brand connection token is consumed once and expires in 5 minutes. If your first install fails for any reason, walk back through `aeko.shop/connect-brand` and generate a new one.

---

## Tools

### `personal` profile

| Tool | Scope required | Description |
|---|---|---|
| `catalog.search` | `catalog:read` | Search AEKO Shop products by query + limit. |
| `catalog.get_brand` | `catalog:read` | Get a public brand profile by slug. |
| `catalog.get_product` | `catalog:read` | Get a product by `brand_slug` + `product_slug`. |
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
| `brand.featured.list` | (read-only) | List the brand's current Featured Products. |
| `brand.featured.replace` | `brand:featured:write` | Replace the Featured Products list (max 6). |
| `brand.deals.list` | (read-only) | List active Hot Deals for this brand. |
| `brand.deals.create` | `brand:deals:write` | Create a Hot Deal (product, headline, optional price, expiry). |
| `brand.deals.retire` | `brand:deals:write` | Retire one active Hot Deal. |
| `brand.orders.list_pending` | `brand:orders:manage` | List orders waiting for brand review. |
| `brand.orders.get` | `brand:orders:manage` | Get one order's full detail. |
| `brand.orders.accept` | `brand:orders:manage` | Accept a pending order. |
| `brand.orders.reject` | `brand:orders:manage` | Reject a pending order. |
| `brand.orders.mark_shipped` | `brand:orders:manage` | Move a brand order into the shipped state. |
| `brand.orders.mark_delivered` | `brand:orders:manage` | Move a brand order into the delivered state. |
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
| `PUT /agent/v1/brand/featured` | 10 / hour |
| `POST /agent/v1/brand/deals` | 20 / day |
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

The package is private until the first npm publish. Until then, install locally by pointing the MCP config directly at the built CLI:

```jsonc
// claude_desktop_config.json
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

---

## Schema version contract

The MCP and the AEKO Shop backend share a versioned scope/schema contract exposed at `GET /agent/v1/_meta`:

```jsonc
{
  "schema_version": "2026-05-22.agent-v1",
  "shopper_scopes": [...],
  "brand_scopes": [...]
}
```

If a future MCP release expects a newer `schema_version` than the live backend, it will warn on startup and refuse to run.
