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

// brand.featured.* and brand.deals.* tools were removed: the backend retired
// manual featured/deals (reads return [], writes 410) and the scopes are no
// longer grantable. brand.profile.update replaces them as the curation surface.
server.tool(
  "brand.profile.update",
  "Update this brand's own profile. Only the fields you pass are written; each becomes owner-locked against automated overwrites. Field availability depends on the brand's plan (free: name + tagline only).",
  {
    name: z.string().min(1).max(240).optional(),
    tagline: z.string().max(500).optional(),
    about_md: z.string().optional(),
    logo_url: z.string().url().max(2048).optional(),
    hero_image_url: z.string().url().max(2048).optional(),
    vertical: z.string().optional(),
  },
  async (input) => {
    const fields = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    return asTextResult(() =>
      api.request("/agent/v1/brand/profile", { method: "PUT", body: JSON.stringify(fields) }),
    );
  },
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
