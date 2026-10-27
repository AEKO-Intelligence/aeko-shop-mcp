// Optional visual QA using the workspace's existing Playwright installation. No real merchant data.
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {CONTEXT_HTML} from '../dist/catalog/context-app.js';
const require=createRequire(resolve(process.argv[2],'package.json'));
const {chromium}=require('playwright');const output=resolve(process.argv[3]);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:800,height:1000},deviceScaleFactor:1});
const product={name:'Daily Barrier Cream',merchant_name:'AEKO LAB · Review fixture',price_minor:24900,currency:'KRW',availability_state:'in_stock',image_url:'https://cdn.shopify.com/review-fixture.svg',merchant_url:'https://example.com/cream',revision:3,context:{sections:{for_who:[{id:'who',label:'Dry routines',value:'For people with a dry-feeling skin routine',details:'Merchant describes cosmetic use only'},{id:'not',label:'not_for',value:'Use on broken skin'}],shopper_needs:[{id:'care',value:'Useful after cleansing',details:'Apply a small amount as directed'}],facts:[{id:'fact',value:'50 ml cream format',details:'Volume refers to one container'}],cautions:[{id:'caution',value:'Avoid direct contact with eyes'}]}},keywords:[{category:'Customer situation',label:'Dry-feeling skin',source_item_ids:['who']},{category:'Care priorities',label:'After cleansing',source_item_ids:['care']},{category:'Product match',label:'50 ml cream',source_item_ids:['fact']}]};
try{
 await page.route('https://cdn.shopify.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="220"><rect width="180" height="220" fill="#f7f6fb"/><rect x="48" y="60" width="84" height="130" rx="12" fill="#e5defb"/><rect x="46" y="42" width="88" height="34" rx="7" fill="#6354ee"/><text x="90" y="115" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#44396c">AEKO LAB</text><text x="90" y="138" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#766a92">REVIEW FIXTURE</text></svg>'}));
 await page.setContent(CONTEXT_HTML);
 await page.evaluate(data=>{window.dispatchEvent(new MessageEvent('message',{source:window,data:{jsonrpc:'2.0',id:1,result:{}}}));window.dispatchEvent(new MessageEvent('message',{source:window,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:data}}}));},product);
 await page.locator('.product-image').waitFor();await page.screenshot({path:resolve(output,'context-card-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Read full context · all sentences'}).click();await page.screenshot({path:resolve(output,'context-card-expanded.png'),fullPage:true});
 await page.getByRole('button',{name:'Back to keywords'}).click();await page.setViewportSize({width:360,height:900});await page.screenshot({path:resolve(output,'context-card-mobile.png'),fullPage:true});
 console.log(output);
}finally{await browser.close();}
