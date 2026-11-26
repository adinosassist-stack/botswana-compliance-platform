/**
 * Real Chromium acceptance of the authenticated, opt-in Lovely editor bridge.
 * All requests are intercepted synthetic drafts: no customer/Cloudflare access.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join,resolve} from "node:path";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
const engine=process.env.QUOTATION_BROWSER_ENGINE_ROOT;
if(!engine)throw Error("isolated_browser_engine_required");
const {chromium}=createRequire(join(engine,"quotation-workspace.cjs"))("playwright");
const root=resolve(process.cwd());
const allowed=new Set([
 "/public/js/essentials-document-share.mjs",
 "/public/js/quotation-custom-workspace-bridge.mjs",
 "/public/js/quotation-customizable-page.mjs",
 "/public/js/quotation-customizable-page-model.mjs",
 "/public/js/quotation-draft-storage-client.mjs",
 "/public/js/quotation-draft-manager.mjs"
]);
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><main id="host"></main><script type="module">
import {mountLovelyQuotationProtectedWorkspace} from "/public/js/quotation-custom-workspace-bridge.mjs";
try {
 window.workspace=mountLovelyQuotationProtectedWorkspace(document.getElementById("host"),{
  capability:{enabled:true,authenticated:true,canEditQuotations:true,
   canCustomizeQuotationPreview:true,canStoreQuotationDrafts:true},
  fetchImpl:fetch.bind(window),csrfToken:"synthetic-csrf-token-12345"
 });
 window.ready=true;
}catch(e){window.fixtureError=String(e)}
</script></body></html>`;
let server,browser,address;
test.before(async()=>{
 server=createServer(async(req,res)=>{
  if(req.url==="/"){res.writeHead(200,{"content-type":"text/html"});res.end(html);return}
  if(!allowed.has(req.url)){res.writeHead(404);res.end();return}
  try{res.writeHead(200,{"content-type":"text/javascript"});res.end(await readFile(join(root,req.url)))}
  catch{res.writeHead(500);res.end()}
 });
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 address="http://127.0.0.1:"+server.address().port+"/";
 browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();await new Promise(done=>server?.close(done))});
test("staff can save, reopen and print a complete 12-line Lovely draft without issuing it",async()=>{
 const context=await browser.newContext({viewport:{width:1280,height:960}});
 const page=await context.newPage();
 let stored,revision=0,calls=0;
 await page.route("**/api/quotation/drafts*",async route=>{
  calls++;
  const req=route.request(),method=req.method(),data=method==="PUT"?req.postDataJSON():null;
  if(method==="PUT"){
   assert.equal(req.headers()["x-csrf-token"],"synthetic-csrf-token-12345");
   assert.equal(data.draftId,"test_quote_12");
   if(data.revision!==revision)return route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({ok:false,error:"conflict"})});
   stored=structuredClone(data.draft);revision++;
  }
  if(method==="GET"&&!stored)return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({ok:false})});
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
   ok:true,draftId:"test_quote_12",revision,draft:stored
  })});
 });
 try{
  await page.goto(address);
  await page.waitForFunction(()=>window.ready||window.fixtureError);
  assert.equal(await page.evaluate(()=>window.fixtureError||null),null);
  assert.equal(calls,0,"mount must not transmit customer data");
  await page.getByLabel("Draft reference").fill("test_quote_12");
  for(let i=0;i<3;i++)await page.getByRole("button",{name:"Add line item"}).click();
  await page.getByLabel("Customer name",{exact:true}).fill("Synthetic Client One");
  const terms=page.locator("details").filter({has:page.locator("summary:text-is('Page 2 — terms and conditions')")});
  await terms.getByLabel("Exact contract wording (editable, preserve line breaks)").fill("Synthetic terms - demonstration only.");
  await page.getByRole("button",{name:"Save Draft"}).click();
  await page.getByRole("status").waitFor();
  await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes("Draft saved"));
  assert.equal(stored.customPage.items.length,12);
  assert.equal(stored.customPage.customerName,"Synthetic Client One");
  assert.equal(stored.customPage.termsText,"Synthetic terms - demonstration only.");
  assert.equal(stored.customPage.items[6].description,"Concrete");
  assert.equal(stored.customPage.items[7].description,"Grout 2kg");
  await page.getByLabel("Customer name",{exact:true}).fill("Unsaved text");
  await page.getByRole("button",{name:"Open Draft"}).click();
  await page.getByRole("button",{name:"Confirm Open"}).click();
  assert.equal(await page.getByLabel("Customer name",{exact:true}).inputValue(),"Synthetic Client One");
  assert.equal(await page.locator(".qcp-page").first().locator("tbody tr").count(),12);
  const pdf=await page.pdf({format:"A4",printBackground:true});
  const pageCount=(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)||[]).length;
  assert.equal(pageCount,2);
 }finally{await context.close()}
});
