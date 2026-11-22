/**
 * Actual Chromium UI acceptance for the opt-in quotation draft form.
 * Intentionally installs Playwright ONLY in an isolated CI prefix.
 * No real customer information, identity, D1/R2, routes, or Cloudflare calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join,resolve} from "node:path";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";

const prefix=process.env.QUOTATION_BROWSER_ENGINE_ROOT;
if(!prefix)throw Error("quotation_browser_acceptance_requires_isolated_engine");
const {chromium}=createRequire(join(prefix,"browser-test.cjs"))("playwright");
const root=resolve(process.cwd());
const allowed=new Set([
 "/public/js/quotation-draft-form.mjs",
 "/public/js/quotation-draft-form-model.mjs",
 "/public/js/quotation-draft-api-client.mjs"
]);
const html=String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:12px;background:#f4f7fa"><div id="host"></div>
<script type="module">
import {mountQuotationDraftForm} from "/public/js/quotation-draft-form.mjs";
try {
 window.fixtureApi=mountQuotationDraftForm(document.getElementById("host"),{
  capability:{enabled:true,authenticated:true,canEditQuotations:true},
  fetchImpl:fetch.bind(window),
  csrfToken:"synthetic-browser-csrf-token",
  initialDraft:{
   quoteNumber:"Q-TEST-1",issueDate:"2026-11-15",
   customerName:"Synthetic Customer",customerContact:"Gaborone",
   discountCents:2000,
   items:[{description:"Memorial",quantity:1,unitPriceCents:120000}]
  }
 });
 window.fixtureReady=true;
}catch(error){window.fixtureError=String(error)}
</script></body></html>`;
let server;
let url;
let browser;
test.before(async()=>{
 server=createServer(async(req,res)=>{
  try{
   if(req.url==="/"){
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
    res.end(html);return;
   }
   if(!allowed.has(req.url)){
    res.writeHead(404);res.end();return;
   }
   const content=await readFile(join(root,req.url));
   res.writeHead(200,{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store"});
   res.end(content);
  }catch{res.writeHead(500);res.end()}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 url="http://127.0.0.1:"+server.address().port+"/";
 browser=await chromium.launch({headless:true});
});
test.after(async()=>{
 await browser?.close();
 await new Promise(resolve=>server?.close(resolve));
});
async function openPage(viewport){
 const context=await browser.newContext({viewport,acceptDownloads:true});
 const page=await context.newPage();
 await page.goto(url);
 await page.waitForFunction(()=>window.fixtureReady===true||!!window.fixtureError);
 assert.equal(await page.evaluate(()=>window.fixtureError||null),null);
 return {context,page};
}
test("actual mobile browser renders all controls without horizontal overflow",async()=>{
 const {context,page}=await openPage({width:390,height:844});
 try{
  assert.equal(await page.locator("h2").innerText(),"Quotation preview");
  assert.equal(await page.getByRole("button",{name:"Download PDF preview"}).isEnabled(),true);
  const dimensions=await page.evaluate(()=>({
   pageWidth:document.documentElement.scrollWidth,windowWidth:innerWidth,
   itemCount:document.querySelectorAll(".qdf-row").length
  }));
  assert.ok(dimensions.pageWidth<=dimensions.windowWidth+1,JSON.stringify(dimensions));
  assert.equal(dimensions.itemCount,1);
  assert.match(await page.locator(".qdf-totals").innerText(),/P1,180.00/);
 }finally{await context.close()}
});
test("actual desktop browser adds line item, recomputes BWP totals, downloads nonissued PDF",async()=>{
 const {context,page}=await openPage({width:1180,height:850});
 let submissions=0,recorded;
 await page.route("**/api/quotation/draft/pdf-preview",async route=>{
  submissions++;
  recorded={method:route.request().method(),headers:route.request().headers(),
    json:route.request().postDataJSON()};
  await route.fulfill({status:200,contentType:"application/pdf",
   headers:{"content-disposition":'attachment; filename="quotation-draft-preview.pdf"'},
   body:Buffer.from("%PDF-1.7\nSynthetic browser acceptance only\n")});
 });
 try{
  await page.getByRole("button",{name:"Add item"}).click();
  const rows=page.locator(".qdf-row");
  assert.equal(await rows.count(),2);
  await rows.nth(1).getByLabel("Description").fill("Installation");
  await rows.nth(1).getByLabel("Qty").fill("1");
  await rows.nth(1).getByLabel("Unit price (P)").fill("350.50");
  assert.match(await page.locator(".qdf-totals").innerText(),/P1,530.50/);
  const awaitedDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download PDF preview"}).click();
  const download=await awaitedDownload;
  assert.equal(download.suggestedFilename(),"quotation-draft-preview.pdf");
  assert.equal(submissions,1);
  assert.equal(recorded.method,"POST");
  assert.equal(recorded.headers["x-csrf-token"],"synthetic-browser-csrf-token");
  assert.equal(recorded.json.items[1].unitPriceCents,35050);
  assert.equal(recorded.json.items[0].unitPriceCents,120000);
  assert.equal(recorded.json.discountCents,2000);
  assert.ok(!Object.hasOwn(recorded.json,"tenantId"));
  assert.ok(!Object.hasOwn(recorded.json,"grandTotalCents"));
  assert.match(await page.locator(".qdf-status").innerText(),/Nothing was issued or saved/);
 }finally{await context.close()}
});
test("actual mobile browser blocks malformed amounts before any network request",async()=>{
 const {context,page}=await openPage({width:375,height:812});
 let requests=0;
 await page.route("**/api/quotation/draft/pdf-preview",async route=>{
  requests++;await route.abort();
 });
 try{
  await page.getByLabel("Discount (P)").fill("1.234");
  assert.equal(await page.getByRole("button",{name:"Download PDF preview"}).isDisabled(),true);
  assert.equal(requests,0);
  await page.getByLabel("Discount (P)").fill("20.00");
  assert.equal(await page.getByRole("button",{name:"Download PDF preview"}).isEnabled(),true);
  for(let i=1;i<8;i++)await page.getByRole("button",{name:"Add item"}).click();
  assert.equal(await page.locator(".qdf-row").count(),8);
  assert.equal(await page.getByRole("button",{name:"Add item"}).isDisabled(),true);
  assert.equal(requests,0);
 }finally{await context.close()}
});

test("mobile blocked automatic download retains explicit Save/Open PDF links until the draft changes",async()=>{
 const {context,page}=await openPage({width:375,height:812});
 let requests=0;
 await page.route("**/api/quotation/draft/pdf-preview",async route=>{
  requests++;
  await route.fulfill({status:200,contentType:"application/pdf",
   body:Buffer.from("%PDF-1.7\nSynthetic phone fallback acceptance\n")});
 });
 try{
  await page.evaluate(()=>{
   window.blockedAutomaticDownloads=0;
   const originalClick=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(){
    if(this.classList.contains("qdf-download-link")){
     window.blockedAutomaticDownloads++;return;
    }
    return originalClick.call(this);
   };
   window.revokedPdfUrls=0;
   const originalRevoke=URL.revokeObjectURL.bind(URL);
   URL.revokeObjectURL=function(url){window.revokedPdfUrls++;return originalRevoke(url)};
  });
  await page.getByRole("button",{name:"Download PDF preview"}).click();
  await page.getByRole("link",{name:"Save PDF"}).waitFor({state:"visible"});
  const save=page.getByRole("link",{name:"Save PDF"});
  const open=page.getByRole("link",{name:"Open PDF"});
  assert.equal(await open.isVisible(),true);
  assert.equal(await page.evaluate(()=>window.blockedAutomaticDownloads),1);
  assert.match(await page.locator(".qdf-status").innerText(),/If no download appeared, tap Save PDF or Open PDF/);
  assert.doesNotMatch(await page.locator(".qdf-status").innerText(),/PDF downloaded/);
  const rect=await save.boundingBox();
  assert.ok(rect&&rect.height>=44&&rect.x>=0&&rect.x+rect.width<=375+1,
   "manual save action must remain accessible on mobile");
  const awaitedDownload=page.waitForEvent("download");
  await save.click();
  assert.equal((await awaitedDownload).suggestedFilename(),"quotation-draft-preview.pdf");
  assert.equal(requests,1,"manual save must not trigger a second network request");
  await page.getByLabel("Customer name").fill("Updated Synthetic Client");
  assert.equal(await save.isVisible(),false,"an old PDF must not stay available after edits");
  assert.equal(await open.isVisible(),false);
  assert.equal(await page.evaluate(()=>window.revokedPdfUrls),1);
 }finally{await context.close()}
});

test("asynchronous PDF response is discarded when quotation is edited while preparing",async()=>{
 const {context,page}=await openPage({width:390,height:844});
 let releaseResponse;
 let requestObserved;
 const observed=new Promise(resolve=>{requestObserved=resolve});
 await page.route("**/api/quotation/draft/pdf-preview",async route=>{
  releaseResponse=()=>route.fulfill({status:200,contentType:"application/pdf",
   body:Buffer.from("%PDF-1.7\nSynthetic stale response\n")});
  requestObserved();
 });
 try{
  await page.getByRole("button",{name:"Download PDF preview"}).click();
  await observed;
  await page.getByLabel("Customer name").fill("New synthetic customer");
  await releaseResponse();
  await page.waitForFunction(()=>document.querySelector(".qdf-status")?.textContent.includes("Draft changed"));
  assert.equal(await page.getByRole("link",{name:"Save PDF"}).isVisible(),false);
  assert.equal(await page.getByRole("link",{name:"Open PDF"}).isVisible(),false);
  assert.match(await page.locator(".qdf-status").innerText(),/Tap Download PDF preview again/);
  assert.doesNotMatch(await page.locator(".qdf-status").innerText(),/PDF prepared/);
 }finally{await context.close()}
});
