import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CONTEXT_HTML, CONTEXT_MIME, CONTEXT_RESOURCE, CONTEXT_IMAGE_ORIGINS } from "./context-app.js";

export type PublicRequest = (path: string, init?: RequestInit) => Promise<unknown>;
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const identity = { brand_slug: z.string().min(1).max(200), product_slug: z.string().min(1).max(200) };
const contextPath = ({brand_slug, product_slug}: {brand_slug: string; product_slug: string}) =>
  `/api/context/${encodeURIComponent(brand_slug)}/${encodeURIComponent(product_slug)}`;

export function registerContextTools(server: McpServer, request: PublicRequest) {
  server.registerResource("context-card", CONTEXT_RESOURCE, { mimeType: CONTEXT_MIME, description: "Approved public context, with expandable full sentences" }, async () => ({ contents: [{ uri: CONTEXT_RESOURCE, mimeType: CONTEXT_MIME, text: CONTEXT_HTML,
    _meta: { ui: { csp: { connectDomains: [], resourceDomains: CONTEXT_IMAGE_ORIGINS, frameDomains: [] }, prefersBorder: true } } }] }));
  const run = async (operation: () => Promise<unknown>) => {
    try {
      const value = await operation();
      const structuredContent = value as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent };
    } catch (error) {
      // Do not reflect upstream response bodies: proxy errors can contain private diagnostics.
      return { isError: true, content: [{ type: "text" as const, text: "Public catalog request failed. The product may be unavailable, private, withdrawn, or not approved." }] };
    }
  };
  const meta = { ui: { resourceUri: CONTEXT_RESOURCE } };
  server.registerTool("context.search", { description: "Find products for a customer situation using visible approved public context items. Lexical matches include item citations and revision; not inferred safety or suitability. Bounded scan: follow next_cursor and inspect scan_complete/truncated_matches.", inputSchema: { query: z.string().min(1).max(300), limit: z.number().int().min(1).max(20).default(10), cursor: z.string().optional() }, annotations: readOnly, _meta: meta }, async ({query, limit, cursor}) => run(() => request(`/api/context/search?${new URLSearchParams({q:query, limit:String(limit), ...(cursor ? {cursor} : {})})}`)));
  server.registerTool("context.get", { description: "Read the merchant-approved public context in its published language. Unapproved, private and withdrawn context returns unavailable.", inputSchema: identity, annotations: readOnly, _meta: meta }, async (input) => run(() => request(contextPath(input))));
  server.registerTool("catalog.compare", { description: "Compare 2–4 public products using approved context with citations. Missing context stays unavailable; never infer a winner, medical suitability, or checkout eligibility.", inputSchema: {products: z.array(z.object(identity)).min(2).max(4)}, annotations: readOnly, _meta: meta }, async ({products}) => run(async () => ({items: await Promise.all(products.map(async input => {
    try { return await request(contextPath(input)); } catch { return {...input, available:false, reason:"Approved public context unavailable"}; }
  }))})));
}

export function createPublicCatalogServer(request: PublicRequest) {
  const server = new McpServer({name:"AEKO Shop Public Context", version:"0.1.0"});
  registerContextTools(server, request);
  server.registerTool("catalog.search", {description:"Search public sellable catalog products. Prices are ISO currency minor units; no FX conversion or native checkout implied.", inputSchema:{query:z.string().max(500).optional(),limit:z.number().int().min(1).max(100).default(20)},annotations:readOnly}, async ({query,limit}) => {
    const result = await request(`/ucp/v1/catalog/search?${new URLSearchParams({q:query??"",limit:String(limit)})}`);
    return {content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result as Record<string,unknown>};
  });
  server.registerTool("catalog.get_product", {description:"Retrieve a public product or exact variant through UCP. Does not create a cart or checkout.",inputSchema:{id:z.string().min(1).max(512)},annotations:readOnly}, async ({id}) => {
    const result = await request("/ucp/v1/catalog/product",{method:"POST",body:JSON.stringify({id})});
    return {content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result as Record<string,unknown>};
  });
  return server;
}
