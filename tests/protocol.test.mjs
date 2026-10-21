import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createPublicCatalogServer } from '../dist/catalog/tools.js';
import { createHostedServer } from '../dist/hosted/server.js';
import { CONTEXT_RESOURCE, CONTEXT_MIME, CONTEXT_HTML, CONTEXT_IMAGE_ORIGINS } from '../dist/catalog/context-app.js';
const approved = {name:'Travel bottle',revision:3,content_hash:'approved-hash',context:{sections:{shopper_needs:[{id:'use-1',value:'For travel',details:'Seller reported'}]}},matches:[{item_id:'use-1',value:'For travel',citation:'https://aeko.shop/brands/demo/products/bottle#deep-context'}]};
const seen=[];
const request=async path=>{seen.push(path);if(path.includes('private'))throw Error('private SECRET diagnostics');return path.includes('/search?')?{items:[approved],scan_complete:true,next_cursor:null}:approved;};

test('SDK Streamable HTTP client initializes, lists/calls tools, reads MCP App resource',async()=>{
 const http=createHostedServer(request);await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 const url=new URL(`http://127.0.0.1:${http.address().port}/mcp`);
 const client=new Client({name:'http-protocol-test',version:'1'});
 try {
  const health=await fetch(new URL("/healthz",url));assert.equal(health.status,200);assert.equal((await health.json()).profile,"public-read-only");
  await client.connect(new StreamableHTTPClientTransport(url));
  const {tools}=await client.listTools();assert.equal(tools.length,5);assert(tools.every(t=>t.annotations.readOnlyHint));
  const tool=tools.find(t=>t.name==='context.search');assert.equal(tool._meta.ui.resourceUri,CONTEXT_RESOURCE);
  const result=await client.callTool({name:'context.search',arguments:{query:'travel',limit:5}});
  assert.deepEqual(result.structuredContent.items,[approved]);assert.deepEqual(JSON.parse(result.content[0].text),result.structuredContent);
  const resource=await client.readResource({uri:CONTEXT_RESOURCE});assert.equal(resource.contents[0].mimeType,CONTEXT_MIME);
  assert.deepEqual(resource.contents[0]._meta.ui.csp.connectDomains,[]);assert.deepEqual(resource.contents[0]._meta.ui.csp.resourceDomains,CONTEXT_IMAGE_ORIGINS);assert(resource.contents[0].text.includes('ui/initialize'));
  const rejected=await fetch(url,{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(rejected.status,403);
 } finally {await client.close();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
});

test('hosted read profile returns Retry-After when a client exceeds its minute budget',async()=>{
 const http=createHostedServer(request,['localhost','127.0.0.1'],[],{perClient:2,global:10});
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${http.address().port}/mcp`;
 try{
  const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream','X-AEKO-Client-Hop':'192.0.2.10'};
  const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'});
  assert.equal((await fetch(url,{method:'POST',headers,body})).status,200);
  assert.equal((await fetch(url,{method:'POST',headers,body})).status,200);
  const limited=await fetch(url,{method:'POST',headers,body});
  assert.equal(limited.status,429);
  assert(Number(limited.headers.get('retry-after'))>=1);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'X-AEKO-Client-Hop':'192.0.2.11'},body})).status,200);
 }finally{http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
});

test('independent SDK client handles comparison partial misses and complete text fallback',async()=>{
 const server=createPublicCatalogServer(request);const [a,b]=InMemoryTransport.createLinkedPair();
 const client=new Client({name:'plain-text-client',version:'1'});await server.connect(a);await client.connect(b);
 try {
  const result=await client.callTool({name:'catalog.compare',arguments:{products:[{brand_slug:'demo',product_slug:'bottle'},{brand_slug:'demo',product_slug:'private'}]}});
  const fallback=JSON.parse(result.content[0].text);assert.deepEqual(fallback,result.structuredContent);
  assert.equal(fallback.items[0].context.sections.shopper_needs[0].id,'use-1');assert.equal(fallback.items[1].available,false);assert(!JSON.stringify(result).includes('SECRET'));
  const hidden=await client.callTool({name:'context.get',arguments:{brand_slug:'demo',product_slug:'private'}});assert.equal(hidden.isError,true);
  const resources=await client.listResources();assert(resources.resources.some(r=>r.uri===CONTEXT_RESOURCE));
 }finally{await client.close();await server.close();}
});

async function appHarness() {
 const vm=await import('node:vm');const nodes=[];let listener;const sent=[];
 const make=tag=>({tagName:tag,attributes:{},children:[],hidden:false,textContent:'',append(...xs){this.children.push(...xs)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attributes[k]=v;}});
 const root=make('main');const parent={postMessage(message){sent.push(message)}};
 vm.runInNewContext(CONTEXT_HTML.match(/<script>([\s\S]*)<\/script>/)[1],{URL,Intl,parent,document:{getElementById(){return root},createElement(tag){const node=make(tag);nodes.push(node);return node}},addEventListener(_name,fn){listener=fn}});
 assert.equal(sent[0].method,'ui/initialize');listener({source:parent,data:{jsonrpc:'2.0',id:1,result:{}}});assert.equal(sent[1].method,'ui/notifications/initialized');
 return {nodes,root,send(data){listener({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:data}}});}};
}

test('MCP App white/purple card groups situations and preserves qualifiers/exclusions while expanding',async()=>{
 const app=await appHarness();
 app.send({...approved,name:'<img src=x onerror=alert(1)>',merchant_name:'Demo',price_minor:1299,currency:'USD',availability_state:'in_stock',image_url:'https://cdn.shopify.com/product.png',merchant_url:'https://merchant.example/product',context:{sections:{for_who:[{id:'who',label:'Travel routines',value:'For overnight travel',details:'Use only as directed'},{id:'excluded',label:'not_for',value:'Children'}],shopper_needs:[{id:'care',label:'Easy packing',value:'Portable format'}],facts:[{id:'fact',label:'30 ml',value:'30 ml capacity'}],cautions:[{id:'caution',value:'Avoid eye contact'}]}},keywords:[{category:'Customer situation',label:'Travel',source_item_ids:['who']},{category:'Product match',label:'Unsafe hidden chip',source_item_ids:['missing']} ]});
 const texts=app.nodes.map(n=>n.textContent);
 assert(texts.includes('<img src=x onerror=alert(1)>'));assert(texts.includes('$12.99'));
 assert.deepEqual(app.nodes.filter(n=>n.tagName==='h3').slice(0,3).map(n=>n.textContent),['Customer situation','Care priorities','Product match']);
 assert(texts.some(t=>t.includes('Use only as directed')));assert(texts.includes('Not for: Children'));assert(texts.includes('Avoid eye contact'));assert(!texts.includes('Unsafe hidden chip'));
 const img=app.nodes.find(n=>n.tagName==='img');assert.equal(img.src,'https://cdn.shopify.com/product.png');assert.equal(img.referrerPolicy,'no-referrer');assert(CONTEXT_IMAGE_ORIGINS.includes(new URL(img.src).origin));
 const button=app.nodes.find(n=>n.tagName==='button');const full=app.nodes.find(n=>n.className==='full-context');assert(full.hidden);button.onclick();assert(!full.hidden);assert.equal(button.attributes['aria-expanded'],'true');assert.equal(button.textContent,'Back to keywords');button.onclick();assert(full.hidden);
 assert(CONTEXT_HTML.includes('#6354ee'));assert(!CONTEXT_HTML.includes('innerHTML'));
});

test('MCP App rejects unsafe/disallowed images and merchant URLs and shows commercial unknowns',async()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://evil.example/tracker','https://cdn.shopify.com.evil.example/image','https://user:password@cdn.shopify.com/image']){
  const app=await appHarness();app.send({...approved,image_url:url,merchant_url:url,price_minor:null,currency:null,availability_state:null});
  assert(!app.nodes.some(n=>n.tagName==='img'));assert(app.nodes.some(n=>n.textContent==='Image unavailable'));assert(app.nodes.some(n=>n.textContent==='Price unavailable'));assert(app.nodes.some(n=>n.textContent==='Availability unknown'));assert(!app.nodes.some(n=>n.tagName==='a'));
 }
 const app=await appHarness();app.send({...approved,price_minor:19900,currency:'KRW'});assert(app.nodes.some(n=>n.textContent==='₩19,900'));
 const kwd=await appHarness();kwd.send({...approved,price_minor:1234,currency:'KWD'});assert(kwd.nodes.some(n=>n.className==='price'&&n.textContent.includes('1.234')));
});

test('released personal and brand stdio profiles still initialize without OAuth',async()=>{
 const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
 for(const profile of ['personal','brand']){
  const client=new Client({name:'stdio-compatibility-test',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[new URL('../dist/cli.js',import.meta.url).pathname,profile],stderr:'pipe'});
  try{await client.connect(transport);const {tools}=await client.listTools();assert(tools.some(tool=>tool.name===(profile==='personal'?'catalog.search':'brand.self')));if(profile==='personal')assert(tools.some(tool=>tool.name==='context.search'));}
  finally{await client.close();}
 }
});
