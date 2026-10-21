/** Dependency-free MCP App. Merchant text is inert; images use an exact origin allowlist. */
export const CONTEXT_RESOURCE = "ui://aeko-shop/context-card.html";
export const CONTEXT_MIME = "text/html;profile=mcp-app";
export const CONTEXT_IMAGE_ORIGINS = [
  "https://cdn.shopify.com", "https://img.echosting.cafe24.com",
  "https://aekoshop-htgrg9fha0bbfmed.z02.azurefd.net", "https://aeko.shop", "https://api.aeko.shop",
];
export const CONTEXT_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AEKO Context Card</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:20px;background:#f6f5fb;color:#252238;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif}#cards{max-width:760px;margin:auto}.context-card{background:#fff;border:1px solid #e9e5f3;border-radius:22px;padding:26px;margin-bottom:20px;box-shadow:0 10px 35px #30215c08;overflow-wrap:anywhere}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6354ee;font-weight:750;margin:0 0 16px}.product-header{display:flex;gap:20px;align-items:center}.product-image,.image-placeholder{width:100px;height:112px;flex:0 0 100px;object-fit:contain;background:#f7f6fb;border-radius:14px}.image-placeholder{display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;color:#888298;font-size:11px}.merchant{color:#777184;font-size:12px;margin:0 0 3px}h2{font-size:23px;line-height:1.25;letter-spacing:-.035em;margin:0 0 8px;font-weight:720}.price{font-size:18px;font-weight:700;margin:0}.availability{font-size:11px;color:#736d82;margin:2px 0}.group{border-top:1px solid #f0edf5;margin-top:20px;padding-top:17px}.group h3{font-size:12px;margin:0 0 10px;color:#726b84;font-weight:650}.group:first-of-type h3{color:#6354ee}.chips{display:flex;flex-wrap:wrap;gap:7px}.chip{display:inline-block;border:1px solid #e8e3ff;background:#f4f1ff;color:#4f40c4;border-radius:9px;padding:6px 10px;font-size:12px;font-weight:550}.qualification{margin:6px 0 0;color:#686175;font-size:12px}.exclusions{border-left:3px solid #b6905c;background:#fbf7f1;padding:10px 13px;border-radius:4px 10px 10px 4px;margin-top:18px}.exclusions p{margin:3px 0;font-size:12px}.full-context h3{font-size:12px;text-transform:capitalize;color:#6354ee;margin:19px 0 7px}.full-context p{margin:7px 0}.toggle{width:100%;border:1px solid #e4dfff;background:#fff;color:#6354ee;border-radius:11px;padding:12px;margin-top:21px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.toggle:hover{background:#f8f6ff}.toggle:focus-visible{outline:3px solid #b4aaff;outline-offset:3px}.footer{font-size:10px;color:#8b8499;margin:14px 0 0}.qualifier-label{font-weight:650}.unknown{color:#81798e;font-size:13px}[hidden]{display:none!important}@media(max-width:420px){body{padding:10px}.context-card{padding:18px;border-radius:17px}.product-header{gap:13px}.product-image,.image-placeholder{width:76px;height:92px;flex-basis:76px}h2{font-size:19px}}
</style><main aria-live="polite" id="cards">Loading approved product context…</main><script>
const root=document.getElementById('cards');
const imageOrigins=${JSON.stringify(CONTEXT_IMAGE_ORIGINS)};
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function safeUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url:null;}catch{return null;}}
function price(item){if(!Number.isSafeInteger(item.price_minor)||item.price_minor<0||!/^[A-Z]{3}$/.test(item.currency||''))return 'Price unavailable';try{const format=new Intl.NumberFormat('en',{style:'currency',currency:item.currency});const decimals=format.resolvedOptions().maximumFractionDigits;return format.format(item.price_minor/10**decimals);}catch{return 'Price unavailable';}}
function render(data){
 root.replaceChildren();const items=data.items||data.products||[data];
 for(const item of items){
  const card=element('article',undefined,'context-card');card.append(element('p','AEKO · Deep Context','eyebrow'));
  const header=element('div',undefined,'product-header');const image=safeUrl(item.image_url);
  if(image&&imageOrigins.includes(image.origin)){const img=element('img',undefined,'product-image');img.src=image.href;img.alt=item.name||'Product';img.referrerPolicy='no-referrer';img.loading='lazy';img.onerror=()=>{img.hidden=true;};header.append(img);}else header.append(element('div','Image unavailable','image-placeholder'));
  const identity=element('div');identity.append(element('p',item.merchant_name||'Merchant','merchant'),element('h2',item.name||item.title||'Product context'),element('p',price(item),'price'));
  const availability={in_stock:'In stock',limited_stock:'Limited stock',out_of_stock:'Out of stock'};identity.append(element('p',availability[item.availability_state]||'Availability unknown','availability'));
  // The merchant URL is deliberately not an action: no navigation or tool calls.
  const merchant=safeUrl(item.merchant_url);if(merchant)identity.append(element('p',merchant.hostname,'merchant'));
  header.append(identity);card.append(header);
  const context=item.context||{};const sections=context.sections||{};const compact=element('div');
  const definitions=[['Customer situation',['for_who']],['Care priorities',['shopper_needs']],['Product match',['facts','composition','mechanisms']]];
  const visible=new Map(Object.values(sections).flat().map(sentence=>[sentence.id,sentence]));
  for(const [category,sourceSections] of definitions){
   const group=element('section',undefined,'group');group.append(element('h3',category));const chips=element('div',undefined,'chips');
   const selected=(item.keywords||context.keywords||[]).filter(keyword=>keyword.category===category&&keyword.selected!==false&&Array.isArray(keyword.source_item_ids)&&keyword.source_item_ids.length&&keyword.source_item_ids.every(id=>visible.has(id))&&!keyword.source_item_ids.some(id=>visible.get(id).label==='not_for'));
   const displayed=new Set();
   for(const keyword of selected){chips.append(element('span',keyword.label,'chip'));for(const id of keyword.source_item_ids)displayed.add(id);}
   if(!chips.children.length)chips.append(element('span','No approved keywords','unknown'));group.append(chips);
   // Qualifications are always next to compact claims; expansion is not required.
   for(const id of displayed){const sentence=visible.get(id);if(sentence.details||sentence.tier)group.append(element('p',(sentence.label?sentence.label+': ':'')+sentence.value+(sentence.details?' — '+sentence.details:'')+(sentence.tier?' ('+sentence.tier.replaceAll('_',' ')+')':''),'qualification'));}
   compact.append(group);
  }
  card.append(compact);
  const exclusions=(sections.for_who||[]).filter(sentence=>sentence.label==='not_for');const cautions=sections.cautions||[];
  if(exclusions.length||cautions.length){const warning=element('aside',undefined,'exclusions');warning.append(element('p','Cautions & exclusions','qualifier-label'));for(const sentence of [...exclusions,...cautions])warning.append(element('p',(sentence.label==='not_for'?'Not for: ':'')+sentence.value+(sentence.details?' — '+sentence.details:'')));card.append(warning);}
  const full=element('div',undefined,'full-context');full.hidden=true;if(context.summary)full.append(element('p',context.summary));
  for(const [section,sentences] of Object.entries(sections)){if(!sentences.length)continue;full.append(element('h3',section.replaceAll('_',' ')));for(const sentence of sentences)full.append(element('p',(sentence.label==='not_for'?'Not for: ':sentence.label?sentence.label+': ':'')+sentence.value+(sentence.details?' — '+sentence.details:'')+(sentence.tier?' ('+sentence.tier.replaceAll('_',' ')+')':'')));}
  const button=element('button','Read full context · all sentences','toggle');button.type='button';button.setAttribute('aria-expanded','false');button.onclick=()=>{full.hidden=!full.hidden;compact.hidden=!full.hidden;button.setAttribute('aria-expanded',String(!full.hidden));button.textContent=full.hidden?'Read full context · all sentences':'Back to keywords';};card.append(button,full);
  if(item.available===false)card.append(element('p',item.reason||'Approved context unavailable','unknown'));
  card.append(element('p','Approved product context · revision '+(item.revision??'unavailable')+' · Confirm price, stock and shipping at merchant checkout.','footer'));root.append(card);
 }if(!items.length)root.textContent='No approved public context matched. Try another query.';
}
let ready=false;addEventListener('message',event=>{if(event.source!==parent)return;const m=event.data;if(!m||m.jsonrpc!=='2.0')return;if(m.id===1&&m.result){ready=true;parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');}if(ready&&m.method==='ui/notifications/tool-result'){const result=m.params;if(result.structuredContent)render(result.structuredContent);else root.textContent=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\\n');}});
parent.postMessage({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{appInfo:{name:'AEKO Context Card',version:'0.1.0'},appCapabilities:{availableDisplayModes:['inline']},protocolVersion:'2026-01-26'}},'*');
</script></html>`;
