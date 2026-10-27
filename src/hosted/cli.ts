import { createHostedServer } from "./server.js";
import { API_BASE } from "../shared/config.js";
const server = createHostedServer(async (path, init = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {...init, headers:{"Content-Type":"application/json","X-AEKO-Agent-Source":"aeko_shop_hosted_mcp"},signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Public API ${response.status}`);
  return response.json();
}, (process.env.AEKO_MCP_ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(","), (process.env.AEKO_MCP_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean));
server.listen(Number(process.env.PORT ?? 8788), process.env.HOST ?? "127.0.0.1", () => console.error("AEKO public MCP listening on /mcp"));
