import { createServer, type IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPublicCatalogServer, type PublicRequest } from "../catalog/tools.js";

type RateLimits = { perClient?: number; global?: number };

/** Stateless SDK Streamable HTTP. Public read profile only: never loads local OAuth tokens. */
export function createHostedServer(request: PublicRequest, allowedHosts = ["localhost", "127.0.0.1"], allowedOrigins: string[] = [], limits: RateLimits = {}) {
  const perClientLimit = limits.perClient ?? 120;
  const globalLimit = limits.global ?? 1200;
  const buckets = new Map<string, { start: number; count: number }>();
  function consume(key: string, limit: number, now: number): number | null {
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= 60_000) {
      buckets.set(key, { start: now, count: 1 });
      return null;
    }
    if (bucket.count >= limit) return Math.max(1, Math.ceil((60_000 - (now - bucket.start)) / 1000));
    bucket.count += 1;
    return null;
  }
  return createServer(async (req, res) => {
    if (req.url === "/healthz" && req.method === "GET") {res.writeHead(200, {"Content-Type":"application/json"}).end(JSON.stringify({status:"ok",transport:"streamable-http",profile:"public-read-only"})); return;}
    const host = (req.headers.host ?? "").split(":")[0];
    const origin = req.headers.origin;
    if (!allowedHosts.includes(host) || (origin && !allowedOrigins.includes(origin))) {res.writeHead(403).end(); return;}
    if (req.url !== "/mcp") {res.writeHead(404).end(); return;}
    if (req.method !== "POST") {res.writeHead(405, {Allow:"POST"}).end(); return;}
    const now = Date.now();
    // The public Next.js proxy overwrites this header before forwarding. The
    // hosted app has internal-only ingress and one replica; the global bucket
    // remains a backstop if many clients share one Front Door hop.
    const forwardedHop = req.headers["x-aeko-client-hop"];
    const clientHop = typeof forwardedHop === "string" && isIP(forwardedHop) ? forwardedHop : req.socket.remoteAddress ?? "unknown";
    if (buckets.size > 10_000) for (const [key, bucket] of buckets) if (now - bucket.start >= 60_000) buckets.delete(key);
    const retryAfter = consume(`client:${clientHop}`, perClientLimit, now) ?? consume("global", globalLimit, now);
    if (retryAfter !== null) {res.writeHead(429, {"Retry-After": String(retryAfter), "Cache-Control": "no-store"}).end(); return;}
    let body: unknown;
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {size += chunk.length; if (size > 1024*1024) {res.writeHead(413).end(); return;} chunks.push(chunk);}
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {res.writeHead(400).end(); return;}
    const server = createPublicCatalogServer(request);
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined, enableJsonResponse:true});
    res.on("close", () => {void transport.close(); void server.close();});
    try {await server.connect(transport); await transport.handleRequest(req as IncomingMessage, res, body);}
    catch {if (!res.headersSent) res.writeHead(500).end();}
  });
}
