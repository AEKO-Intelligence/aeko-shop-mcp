// Optional real Next.js transport test; copies exact coordinator-owned route/proxy into an isolated dev app.
import {mkdtemp, mkdir, copyFile, symlink, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHostedServer} from '../dist/hosted/server.js';
import {CONTEXT_RESOURCE} from '../dist/catalog/context-app.js';
const front=resolve(process.argv[2]);const work=await mkdtemp(join(tmpdir(),'aeko-next-mcp-'));
const upstreamHeaders=[];
const hosted=createHostedServer(async()=>({items:[{name:'Approved fixture',revision:1,context:{sections:{facts:[{id:'fixture',value:'For travel'}]}},matches:[]}]}));
hosted.on('request',req=>upstreamHeaders.push(req.headers));
await new Promise(resolve=>hosted.listen(0,'127.0.0.1',resolve));
let next,log='';const client=new Client({name:'next-proxy-sdk-test',version:'1'});
try{
 await mkdir(join(work,'app/mcp'),{recursive:true});await mkdir(join(work,'lib'));
 await copyFile(join(front,'app/mcp/route.ts'),join(work,'app/mcp/route.ts'));
 await copyFile(join(front,'lib/mcp-proxy.ts'),join(work,'lib/mcp-proxy.ts'));
 await symlink(join(front,'node_modules'),join(work,'node_modules'),'dir');
 await writeFile(join(work,'package.json'),JSON.stringify({name:'isolated-next-mcp-proxy',private:true,dependencies:{next:'16.1.6',react:'19.2.3','react-dom':'19.2.3'}}));
 await writeFile(join(work,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'esnext',moduleResolution:'bundler',jsx:'preserve',esModuleInterop:true,paths:{'@/*':['./*']}}}));
 next=spawn(process.execPath,[join(front,'node_modules/next/dist/bin/next'),'dev',work,'--webpack','--port','3319','--hostname','127.0.0.1'],{env:{...process.env,AEKO_SHOP_HOSTED_MCP_URL:`http://127.0.0.1:${hosted.address().port}/mcp`,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 next.stdout.on('data',s=>log+=s);next.stderr.on('data',s=>log+=s);
 const url=new URL('http://127.0.0.1:3319/mcp');
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(url)).status===405){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert(ready,log);
 await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:'Bearer must-be-stripped',Cookie:'merchant=must-be-stripped'}}}));
 assert((await client.listTools()).tools.some(t=>t.name==='context.search'));
 const result=await client.callTool({name:'context.search',arguments:{query:'travel'}});assert.equal(result.structuredContent.items[0].name,'Approved fixture');
 assert((await client.readResource({uri:CONTEXT_RESOURCE})).contents[0].text.includes('ui/initialize'));
 assert(upstreamHeaders.every(headers=>!headers.authorization&&!headers.cookie&&!headers.origin));
 console.log('PASS: SDK initialize/list/call/resource via actual isolated Next.js POST proxy; identity headers stripped');
}finally{
 await client.close();if(next){const exited=once(next,'exit');next.kill('SIGTERM');await exited;}hosted.closeAllConnections();await new Promise(resolve=>hosted.close(resolve));await rm(work,{recursive:true,force:true});
}
