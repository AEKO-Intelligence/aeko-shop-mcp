import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AekoApiClient } from "../shared/api-client.js";
import { asTextResult } from "../shared/tool-result.js";

const api = new AekoApiClient("brand");
const server = new McpServer({ name: "AEKO Brand Agent", version: "0.1.0" });

server.tool("brand.self", "Show this AEKO brand-agent install.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/self")),
);

server.tool("brand.featured.list", "List featured products for this brand.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/brand/featured")),
);

server.tool(
  "brand.featured.replace",
  "Replace this brand's featured products.",
  {
    items: z
      .array(z.object({ product_id: z.string().uuid(), caption: z.string().max(240).optional() }))
      .min(0)
      .max(6),
  },
  async (input) =>
    asTextResult(() => api.request("/agent/v1/brand/featured", { method: "PUT", body: JSON.stringify(input) })),
);

server.tool("brand.deals.list", "List active hot deals for this brand.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/brand/deals")),
);

server.tool(
  "brand.deals.create",
  "Create a hot deal for this brand.",
  {
    product_id: z.string().uuid(),
    headline: z.string().min(1).max(120),
    deal_price_minor: z.number().int().nonnegative().optional(),
    currency: z.string().min(3).max(12).optional(),
    expires_at: z.string().datetime(),
  },
  async (input) =>
    asTextResult(() => api.request("/agent/v1/brand/deals", { method: "POST", body: JSON.stringify(input) })),
);

server.tool(
  "brand.deals.retire",
  "Retire one active hot deal.",
  { deal_id: z.string().uuid() },
  async ({ deal_id }) =>
    asTextResult(() => api.request(`/agent/v1/brand/deals/${encodeURIComponent(deal_id)}`, { method: "DELETE" })),
);

server.tool(
  "brand.orders.list_pending",
  "List pending orders for this brand.",
  { limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) },
  async ({ limit, offset }) =>
    asTextResult(() =>
      api.request(
        `/agent/v1/brand/orders?${new URLSearchParams({
          status: "draft_pending_human_review",
          limit: String(limit),
          offset: String(offset),
        })}`,
      ),
    ),
);

server.tool(
  "brand.orders.get",
  "Get one order for this brand.",
  { order_id: z.string().uuid() },
  async ({ order_id }) => asTextResult(() => api.request(`/agent/v1/brand/orders/${encodeURIComponent(order_id)}`)),
);

for (const [name, path] of [
  ["brand.orders.accept", "accept"],
  ["brand.orders.reject", "reject"],
  ["brand.orders.mark_shipped", "mark-shipped"],
  ["brand.orders.mark_delivered", "mark-delivered"],
] as const) {
  server.tool(name, `Run ${path} for one brand order.`, { order_id: z.string().uuid() }, async ({ order_id }) =>
    asTextResult(() =>
      api.request(`/agent/v1/brand/orders/${encodeURIComponent(order_id)}/${path}`, { method: "POST" }),
    ),
  );
}

server.tool("brand.self.disconnect", "Disconnect and revoke this AEKO brand-agent install.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/self/disconnect", { method: "POST" })),
);

await server.connect(new StdioServerTransport());
