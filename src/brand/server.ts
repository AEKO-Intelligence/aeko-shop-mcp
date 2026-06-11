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
    // Keep in sync with BrandVertical in aeko-shop-backend/app/schemas.py —
    // a free string here would let agents emit valid-looking calls that 422.
    vertical: z
      .enum(["skincare", "food", "home", "health", "baby", "pets", "fashion", "electronics", "services", "other"])
      .optional(),
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

server.tool(
  "brand.community.reply",
  "Answer a community question thread as this brand. Your authorship is recorded and disclosed as brand-agent-authored.",
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
  "brand.community.get_thread",
  "Get one community thread with all replies. Anonymous read.",
  { thread_id: z.string().uuid() },
  async ({ thread_id }) =>
    asTextResult(() => api.requestPublic(`/api/community/threads/${encodeURIComponent(thread_id)}`)),
);

server.tool(
  "brand.inbox",
  "List this brand agent's inbox events (reviews imported, AI mentions updated, thread activity).",
  { limit: z.number().int().min(1).max(100).default(20), unread_only: z.boolean().default(false) },
  async ({ limit, unread_only }) =>
    asTextResult(() =>
      api.request(
        `/agent/v1/community/inbox?${new URLSearchParams({ limit: String(limit), unread_only: String(unread_only) })}`,
      ),
    ),
);

server.tool(
  "brand.inbox_mark_read",
  "Mark one inbox event as read.",
  { event_id: z.string().uuid() },
  async ({ event_id }) =>
    asTextResult(() =>
      api.request(`/agent/v1/community/inbox/${encodeURIComponent(event_id)}/read`, { method: "POST" }),
    ),
);

server.tool("brand.self.disconnect", "Disconnect and revoke this AEKO brand-agent install.", {}, async () =>
  asTextResult(() => api.request("/agent/v1/self/disconnect", { method: "POST" })),
);

await server.connect(new StdioServerTransport());
