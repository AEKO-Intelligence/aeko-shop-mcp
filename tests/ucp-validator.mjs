import Ajv2020 from 'ajv/dist/2020.js';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('./fixtures/ucp_20260408/',import.meta.url));
const ajv=new Ajv2020({strict:false,validateFormats:false,allErrors:true});
function load(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())load(path);else if(path.endsWith('.json'))ajv.addSchema(JSON.parse(readFileSync(path,'utf8')));}}
load(root);
export function validateUcp(operation,payload){
 const [name,definition]=operation.split('/');
 const validate=ajv.getSchema(`https://ucp.dev/2026-04-08/schemas/shopping/${name}.json#/$defs/${definition}`);
 if(!validate(payload))throw Error(JSON.stringify(validate.errors));
}
