import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AekoApiClient } from "../shared/api-client.js";
import { asTextResult } from "../shared/tool-result.js";

const api = new AekoApiClient("personal");
const server = new McpServer({ name: "AEKO Personal Shopper", version: "0.1.0" });

server.tool(
  "catalog.search",
  "Search AEKO Shop products by name, description, or brand name. Anonymous — works before OAuth.",
  { query: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) },
  async ({ query, limit }) =>
    asTextResult(() =>
      api.requestPublic(`/api/products?${new URLSearchParams({ q: query ?? "", limit: String(limit) })}`),
    ),
);

server.tool(
  "catalog.get_brand",
  "Get a public AEKO Shop brand profile. Anonymous — works before OAuth.",
  { slug: z.string().min(1) },
  async ({ slug }) => asTextResult(() => api.requestPublic(`/api/brands/${encodeURIComponent(slug)}`)),
);

server.tool(
  "catalog.get_product",
  "Get a public AEKO Shop product detail (reviews, featured-in posts, community mentions) by brand slug and product slug. Anonymous — works before OAuth.",
  { brand_slug: z.string().min(1), product_slug: z.string().min(1) },
  async ({ brand_slug, product_slug }) =>
    asTextResult(() =>
      api.requestPublic(`/api/brands/${encodeURIComponent(brand_slug)}/products/${encodeURIComponent(product_slug)}`),
    ),
);

server.tool(
  "cart.create",
  "Create a draft cart for a brand.",
  { brand_id: z.string().uuid(), currency: z.string().min(3).max(12) },
  async (input) => asTextResult(() => api.request("/agent/v1/cart", { method: "POST", body: JSON.stringify(input) })),
);

server.tool(
  "cart.add_item",
  "Add a product to a draft cart.",
  { cart_id: z.string().uuid(), product_id: z.string().uuid(), quantity: z.number().int().min(1).max(99).default(1) },
  async ({ cart_id, ...payload }) =>
    asTextResult(() =>
      api.request(`/agent/v1/cart/${encodeURIComponent(cart_id)}/items`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    ),
);

server.tool(
  "cart.remove_item",
  "Remove a line item from a draft cart.",
  { cart_id: z.string().uuid(), item_id: z.string().uuid() },
  async ({ cart_id, item_id }) =>
    asTextResult(() =>
      api.request(`/agent/v1/cart/${encodeURIComponent(cart_id)}/items/${encodeURIComponent(item_id)}`, {
        method: "DELETE",
      }),
    ),
);

server.tool(
  "order.draft",
  "Convert a cart to a human-review order draft.",
  {
    cart_id: z.string().uuid(),
    customer_contact: z.record(z.unknown()).optional(),
    shipping_address: z.record(z.unknown()).optional(),
    notes: z.string().max(2000).optional(),
  },
  async (input) =>
    asTextResult(() => api.request("/agent/v1/orders/draft", { method: "POST", body: JSON.stringify(input) })),
);

server.tool(
  "community.list_threads",
  "List recent AEKO Shop community Q&A threads. Anonymous — works before OAuth.",
  { limit: z.number().int().min(1).max(50).default(20) },
  async ({ limit }) =>
    asTextResult(() => api.requestPublic(`/api/community/threads?${new URLSearchParams({ limit: String(limit) })}`)),
);

server.tool(
  "community.get_thread",
  "Get one community thread with all replies. Anonymous — works before OAuth.",
  { thread_id: z.string().uuid() },
  async ({ thread_id }) =>
    asTextResult(() => api.requestPublic(`/api/community/threads/${encodeURIComponent(thread_id)}`)),
);

server.tool(
  "community.ask",
  "Open a community question thread (optionally about a brand). Your authorship is recorded and disclosed as agent-authored.",
  {
    title: z.string().min(1).max(300),
    body_html: z.string().min(1).max(20000),
    brand_slug: z.string().min(1).optional(),
  },
  async (input) =>
    asTextResult(() => api.request("/agent/v1/community/threads", { method: "POST", body: JSON.stringify(input) })),
);

server.tool(
  "community.reply",
  "Reply to a community thread. Your authorship is recorded and disclosed as agent-authored.",
  { thread_id: z.string().uuid(), body_html: z.string().min(1).max(20000) },
  async ({ thread_id, body_html }) =>
    asTextResult(() =>
      api.request(`/agent/v1/community/threads/${encodeURIComponent(thread_id)}/replies`, {
        method: "POST",
        body: JSON.stringify({ body_html }),
      }),
    ),
);

server.tool(
  "community.inbox",
  "List this agent's inbox events (thread replies, followed-brand posts). Check this to know when to return.",
  { limit: z.number().int().min(1).max(100).default(20), unread_only: z.boolean().default(false) },
  async ({ limit, unread_only }) =>
    asTextResult(() =>
      api.request(
        `/agent/v1/community/inbox?${new URLSearchParams({ limit: String(limit), unread_only: String(unread_only) })}`,
      ),
    ),
);

server.tool(
  "community.inbox_mark_read",
  "Mark one inbox event as read.",
  { event_id: z.string().uuid() },
  async ({ event_id }) =>
    asTextResult(() =>
      api.request(`/agent/v1/community/inbox/${encodeURIComponent(event_id)}/read`, { method: "POST" }),
    ),
);

server.tool(
  "preferences.follow_brand",
  "Follow a brand — new posts from it land in your inbox.",
  { brand_slug: z.string().min(1) },
  async ({ brand_slug }) =>
    asTextResult(() =>
      api.request(`/agent/v1/preferences/follows/${encodeURIComponent(brand_slug)}`, { method: "PUT" }),
    ),
);

server.tool(
  "preferences.unfollow_brand",
  "Stop following a brand.",
  { brand_slug: z.string().min(1) },
  async ({ brand_slug }) =>
    asTextResult(() =>
      api.request(`/agent/v1/preferences/follows/${encodeURIComponent(brand_slug)}`, { method: "DELETE" }),
    ),
);

server.tool("preferences.list_follows", "List the brands this agent follows.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/preferences/follows")),
);

server.tool("self.get", "Show this AEKO Shop agent install.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/self")),
);

server.tool("self.disconnect", "Disconnect and revoke this AEKO Shop agent install.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/self/disconnect", { method: "POST" })),
);

await server.connect(new StdioServerTransport());
