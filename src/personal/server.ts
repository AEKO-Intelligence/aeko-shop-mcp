import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AekoApiClient } from "../shared/api-client.js";
import { asTextResult } from "../shared/tool-result.js";

const api = new AekoApiClient("personal");
const server = new McpServer({ name: "AEKO Personal Shopper", version: "0.1.0" });

server.tool(
  "catalog.search",
  "Search AEKO Shop products.",
  { query: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) },
  async ({ query, limit }) =>
    asTextResult(() => api.request(`/api/products?${new URLSearchParams({ q: query ?? "", limit: String(limit) })}`)),
);

server.tool(
  "catalog.get_brand",
  "Get a public AEKO Shop brand profile.",
  { slug: z.string().min(1) },
  async ({ slug }) => asTextResult(() => api.request(`/api/brands/${encodeURIComponent(slug)}`)),
);

server.tool(
  "catalog.get_product",
  "Get a public AEKO Shop product detail by brand slug and product slug.",
  { brand_slug: z.string().min(1), product_slug: z.string().min(1) },
  async ({ brand_slug, product_slug }) =>
    asTextResult(() =>
      api.request(`/api/brands/${encodeURIComponent(brand_slug)}/products/${encodeURIComponent(product_slug)}`),
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

server.tool("self.get", "Show this AEKO Shop agent install.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/self")),
);

server.tool("self.disconnect", "Disconnect and revoke this AEKO Shop agent install.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/self/disconnect", { method: "POST" })),
);

await server.connect(new StdioServerTransport());
