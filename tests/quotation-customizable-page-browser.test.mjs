/**
 * Real Chromium acceptance for the explicitly mounted, source-only custom
 * quotation print preview. Synthetic values only; no Cloudflare/DB/network writes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join,resolve} from "node:path";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";

const prefix=process.env.QUOTATION_BROWSER_ENGINE_ROOT;
if(!prefix)throw Error("quotation_browser_acceptance_requires_isolated_engine");
const {chromium}=createRequire(join(prefix,"custom-browser-test.cjs"))("playwright");
const root=resolve(process.cwd());
const allowed=new Set([
 "/public/js/quotation-customizable-page.mjs",
 "/public/js/quotation-customizable-page-model.mjs"
]);
const html=String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0"><div id="root"></div>
<script type="module">
import {mountQuotationCustomizablePage} from "/public/js/quotation-customizable-page.mjs";
try{
 window.editor=mountQuotationCustomizablePage(document.getElementById("root"),{
  capability:{enabled:true,authenticated:true,canEditQuotations:true,
   canCustomizeQuotationPreview:true}
 });
 window.ready=true;
}catch(error){window.fixtureError=String(error)}
</script></body></html>`;
let server,browser,url;
test.before(async()=>{
 server=createServer(async(req,res)=>{
  if(req.url==="/"){
   res.writeHead(200,{"content-type":"text/html","cache-control":"no-store"});
   res.end(html);return;
  }
  if(!allowed.has(req.url)){res.writeHead(404);res.end();return}
  try{
   const contents=await readFile(join(root,req.url));
   res.writeHead(200,{"content-type":"text/javascript","cache-control":"no-store"});
   res.end(contents);
  }catch{res.writeHead(500);res.end()}
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 url="http://127.0.0.1:"+server.address().port+"/";
 browser=await chromium.launch({headless:true});
});
test.after(async()=>{
 await browser?.close();
 await new Promise(ok=>server?.close(ok));
});
async function open(viewport){
 const context=await browser.newContext({viewport});
 const page=await context.newPage();
 await page.goto(url);
 await page.waitForFunction(()=>window.ready===true||window.fixtureError);
 assert.equal(await page.evaluate(()=>window.fixtureError||null),null);
 return {context,page};
}
test("two-page print preview has exactly one company phone in footer, never the header",async()=>{
 const {context,page}=await open({width:1200,height:850});
 try{
  const pages=page.locator(".qcp-page");
  assert.equal(await pages.count(),2);
  assert.equal(await page.locator(".qcp-masthead").allInnerTexts().then(a=>a.join(" ")).then(s=>s.includes("+267 74 583 606")),false);
  const footer=page.locator(".qcp-contact");
  assert.equal(await footer.count(),1);
  assert.match(await footer.innerText(),/\+267 74 583 606/);
  assert.match(await footer.innerText(),/lovelystones26@gmail\.com/);
  assert.equal(await page.locator(".qcp-page").allInnerTexts().then(a=>a.join(" ").match(/\+267 74 583 606/g)?.length),1);
 }finally{await context.close()}
});
test("customer name/number show on printed quotation, nine separate item rows and exact totals",async()=>{
 const {context,page}=await open({width:1100,height:860});
 try{
  assert.equal(await page.locator(".qcp-page").first().locator("tbody tr").count(),9);
  const rows=await page.locator(".qcp-page").first().locator("tbody tr").allInnerTexts();
  assert.match(rows[6],/^Concrete/);
  assert.match(rows[7],/^Grout 2kg/);
  assert.match(rows[8],/^Labour \/ Transport/);
  assert.match(await page.locator(".qcp-grand").innerText(),/P14,000\.00/);
  const form=page.locator(".qcp-sidebar");
  await form.getByLabel("Customer name",{exact:true}).fill("Sample Ms K");
  await form.getByLabel("Customer number",{exact:true}).fill("+267 72 555 555");
  assert.match(await page.locator(".qcp-meta").innerText(),/Sample Ms K/);
  assert.match(await page.locator(".qcp-meta").innerText(),/\+267 72 555 555/);
 }finally{await context.close()}
});
test("full document text and unchanged legal terms are editable only in private preview",async()=>{
 const {context,page}=await open({width:1200,height:900});
 try{
  const copy=page.locator("details").filter({has:page.locator("summary:text-is('Customize ALL document wording')")});
  await copy.locator("summary").click();
  await copy.getByLabel("heading",{exact:true}).fill("YOUR CUSTOM QUOTE");
  assert.match(await page.locator(".qcp-heading").first().innerText(),/YOUR CUSTOM QUOTE/);
  const terms=page.locator("details").filter({has:page.locator("summary:text-is('Page 2 — terms and conditions')")});
  await terms.getByLabel("Exact contract wording (editable, preserve line breaks)").fill("Original text preserved.\n4. Refund words remain unchanged.");
  assert.match(await page.locator(".qcp-terms").innerText(),/4\. Refund words remain unchanged/);
  assert.match(await page.locator(".qcp-watermark").first().innerText(),/NOT FOR CUSTOMER ISSUE/);
 }finally{await context.close()}
});
test("mobile preview does not cause horizontal page overflow and never uploads",async()=>{
 const {context,page}=await open({width:390,height:844});
 try{
  const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));
  assert.ok(dimensions.scroll<=dimensions.inner+1,JSON.stringify(dimensions));
  assert.equal(await page.locator(".qcp-page").first().locator(".qcp-meta h3").filter({hasText:"CUSTOMER DETAILS"}).count(),1);
 }finally{await context.close()}
});

test("printed PDF stays exactly two A4 pages in a real Chromium print engine",async()=>{
 const {context,page}=await open({width:1280,height:960});
 try{
  const bytes=await page.pdf({format:"A4",printBackground:true});
  const pageObjects=bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)||[];
  assert.equal(pageObjects.length,2,"Expected precisely two printable pages");
 }finally{await context.close()}
});

test("reset restores draft without invalidating the mounted editor handle",async()=>{
 const {context,page}=await open({width:1050,height:900});
 try{
  await page.getByLabel("Customer name",{exact:true}).fill("Changed sample");
  assert.equal(await page.evaluate(()=>window.editor.getDraft().customerName),"Changed sample");
  await page.getByRole("button",{name:"Reset sample"}).click();
  assert.equal(await page.evaluate(()=>window.editor.getDraft().customerName),"Sample customer");
  assert.match(await page.locator(".qcp-meta").innerText(),/Sample customer/);
 }finally{await context.close()}
});

test("twelve editable rows retain separate Concrete and Grout entries across two printed A4 pages",async()=>{
 const {context,page}=await open({width:1280,height:960});
 try{
  for(let n=0;n<3;n++)await page.getByRole("button",{name:"Add line item"}).click();
  const rows=page.locator(".qcp-page").first().locator("tbody tr");
  assert.equal(await rows.count(),12);
  assert.match(await rows.nth(6).innerText(),/^Concrete/);
  assert.match(await rows.nth(7).innerText(),/^Grout 2kg/);
  await page.getByLabel("Price 10",{exact:true}).fill("123.45");
  await page.getByLabel("Price 11",{exact:true}).fill("200.00");
  await page.getByLabel("Price 12",{exact:true}).fill("75.00");
  assert.match(await page.locator(".qcp-grand").innerText(),/P14,398\.45/);
  const geometry=await page.evaluate(()=>[...document.querySelectorAll(".qcp-page")].map(
   p=>({scrollHeight:p.scrollHeight,clientHeight:p.clientHeight})
  ));
  assert.ok(geometry.every(x=>x.scrollHeight<=x.clientHeight+2),
   "Page content would be clipped: "+JSON.stringify(geometry));
  const pdf=await page.pdf({format:"A4",printBackground:true});
  const pages=pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)||[];
  assert.equal(pages.length,2,"twelve lines must still print as two A4 pages");
 }finally{await context.close()}
});

test("local exported draft JSON can be reimported, retaining wording, terms, phone and twelve lines",async()=>{
 const {context,page}=await open({width:1280,height:960});
 try{
  const sample=await page.evaluate(()=>window.editor.getDraft());
  for(let n=0;n<3;n++)sample.items.push({description:"Extra "+n,quantity:"1",unitPrice:"2.50"});
  sample.customerName="Synthetic restored name";
  sample.customerPhone="+267 72 000 000";
  sample.copy.heading="EDITABLE CUSTOM QUOTATION";
  sample.termsText="Operator supplied sample terms, not for issuance.";
  await page.locator('input[aria-label="Import quotation draft JSON file"]').setInputFiles({
   name:"synthetic-quote.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(sample))
  });
  await page.waitForFunction(()=>window.editor.getDraft().customerName==="Synthetic restored name");
  const loaded=await page.evaluate(()=>window.editor.getDraft());
  assert.deepEqual(loaded,sample);
  assert.equal(await page.locator(".qcp-page").first().locator("tbody tr").count(),12);
  assert.match(await page.locator(".qcp-heading").first().innerText(),/EDITABLE CUSTOM QUOTATION/);
  assert.match(await page.locator(".qcp-terms").innerText(),/Operator supplied sample terms/);
  const pdf=await page.pdf({format:"A4",printBackground:true});
  assert.equal((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)||[]).length,2);
 }finally{await context.close()}
});
test("invalid JSON import does not mutate current quotation",async()=>{
 const {context,page}=await open({width:1280,height:960});
 try{
  const before=await page.evaluate(()=>window.editor.getDraft());
  await page.locator('input[aria-label="Import quotation draft JSON file"]').setInputFiles({
   name:"corrupt.json",mimeType:"application/json",buffer:Buffer.from('{"customerName":"Tampered"}')
  });
  await page.waitForFunction(()=>document.querySelector(".qcp-status").textContent.includes("Invalid quotation JSON"));
  assert.deepEqual(await page.evaluate(()=>window.editor.getDraft()),before);
 }finally{await context.close()}
});


test("logo chooser accepts a browser PNG preview, rejects corrupt image and never claims account persistence",async()=>{
 const {context,page}=await open({width:390,height:844});
 try{
  const logoFile=page.locator('input[aria-label="Upload company logo"]');
  assert.ok(await logoFile.isVisible(),"Logo chooser should be expanded and discoverable");
  const base64=await page.evaluate(()=>{
   const canvas=document.createElement("canvas");
   canvas.width=120;canvas.height=60;
   canvas.getContext("2d").fillRect(0,0,120,60);
   return canvas.toDataURL("image/png").split(",")[1];
  });
  await logoFile.setInputFiles({name:"company.png",mimeType:"image/png",buffer:Buffer.from(base64,"base64")});
  await page.waitForFunction(()=>document.querySelectorAll(".qcp-brand img").length===2);
  assert.match(await page.locator(".qcp-status").innerText(),/not saved to your account/);
  assert.equal(await page.locator(".qcp-brand img").count(),2);
  const draft=await page.evaluate(()=>window.editor.getDraft());
  assert.equal(JSON.stringify(draft).includes("data:image"),false,"Logo bytes must not leak into JSON draft");
  await logoFile.setInputFiles({name:"corrupt.jpg",mimeType:"image/jpeg",buffer:Buffer.alloc(100,42)});
  await page.waitForFunction(()=>document.querySelector(".qcp-status").textContent.includes("could not be opened"));
  assert.equal(await page.locator(".qcp-brand img").count(),2,"Failed replacement must not clear existing preview");
  await page.getByRole("button",{name:"Reset sample"}).click();
  assert.equal(await page.locator(".qcp-brand img").count(),0,"Reset clears local object URL");
 }finally{await context.close()}
});


test("mobile print remains tappable across 320/375/414/430 widths without claiming PDF generation",async()=>{
 for(const width of [320,375,414,430]){
  const {context,page}=await open({width,height:800});
  try{
   await page.evaluate(()=>{
    window.quotationPrintCalls=0;
    window.print=()=>{window.quotationPrintCalls++};
   });
   const button=page.getByRole("button",{name:"Print / Save PDF"});
   const bounds=await button.boundingBox();
   assert.ok(bounds&&bounds.height>=44,`Mobile print tap target too small at ${width}`);
   assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,`Mobile print button clipped at ${width}`);
   await button.click();
   assert.equal(await page.evaluate(()=>window.quotationPrintCalls),1,
    `print() should be invoked directly by tap at ${width}`);
   assert.match(await page.locator("#qcp-print-status").innerText(),/If no dialog appears/);
   assert.doesNotMatch(await page.locator("#qcp-print-status").innerText(),/PDF generated|PDF downloaded/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }finally{await context.close()}
 }
});
test("missing browser print API opens accessible phone instructions without false success",async()=>{
 const {context,page}=await open({width:375,height:812});
 try{
  await page.evaluate(()=>{window.print=undefined});
  await page.getByRole("button",{name:"Print / Save PDF"}).click();
  assert.match(await page.locator("#qcp-print-status").innerText(),/Printing is unavailable/);
  assert.equal(await page.locator("#qcp-print-status").evaluate(e=>document.activeElement===e),true);
  const help=page.locator("details").filter({has:page.getByText("How to save as PDF on your phone")});
  assert.equal(await help.evaluate(e=>e.open),true);
  assert.match(await help.innerText(),/Android Chrome/);
  assert.match(await help.innerText(),/iPhone Safari/);
 }finally{await context.close()}
});
