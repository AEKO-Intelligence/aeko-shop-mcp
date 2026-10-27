// Integration probe against a real shared-backend API, with approved fixture supplied by caller.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {validateUcp} from './ucp-validator.mjs';
import { createHostedServer } from '../dist/hosted/server.js';
const [base,brand,product] = process.argv.slice(2);
const server=createHostedServer(async (path,init={})=>{const response=await fetch(base+path,{...init,headers:{'Content-Type':'application/json'}});if(!response.ok)throw Error(String(response.status));return response.json();});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const client=new Client({name:'real-backend-protocol-probe',version:'1'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`)));
 for(const [path,payload,operation] of [
  ['/ucp/v1/catalog/search',{query:'Product'},'catalog_search/search_response'],
  ['/ucp/v1/catalog/lookup',{ids:[`aeko://product/${brand}/${product}`]},'catalog_lookup/lookup_response'],
  ['/ucp/v1/catalog/product',{id:`aeko://product/${brand}/${product}`},'catalog_lookup/get_product_response']]){
   const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   assert.equal(response.status,200);validateUcp(operation,await response.json());
 }
 const result=await client.callTool({name:'context.search',arguments:{query:'overnight travel'}});
 assert(!result.isError,JSON.stringify(result));
 const match=result.structuredContent.items.find(item=>item.brand_slug===brand&&item.product_slug===product);
 assert(match,'Real approved situation query must find fixture');assert.equal(match.language,'en');assert(match.matches[0].item_id);assert(match.matches[0].citation.includes('/brands/'));
 const detail=await client.callTool({name:'context.get',arguments:{brand_slug:brand,product_slug:product}});
 assert.equal(detail.structuredContent.content_hash,match.content_hash);assert.equal(detail.structuredContent.revision,match.revision);
 assert.deepEqual(JSON.parse(detail.content[0].text),detail.structuredContent);
 console.log(JSON.stringify({transport:'SDK Streamable HTTP',query:'overnight travel',revision:match.revision,language:match.language,citations:match.matches.map(m=>({item_id:m.item_id,citation:m.citation}))}));
}finally{await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
