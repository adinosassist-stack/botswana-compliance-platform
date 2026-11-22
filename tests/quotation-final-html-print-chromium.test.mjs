import {readFile} from "node:fs/promises";
import {quotationBrowserPreview} from "../cloudflare/src/quotation-browser-preview.js";
/**
 * Real isolated Chromium print acceptance for owner-selected final Lovely HTML.
 * Synthetic data only; no service, real template, credentials or customer data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join} from "node:path";
import {quotationCustomSample} from "../public/js/quotation-customizable-page-model.mjs";
import {renderLovelyFinalQuotationPrintHtml} from "../server/quotation-final-html-print.mjs";
const root=process.env.QUOTATION_BROWSER_ENGINE_ROOT;
if(!root)throw Error("quotation_chromium_engine_root_required");
const {chromium}=createRequire(join(root,"final-quote-acceptance.cjs"))("playwright");
const pdfLib=createRequire(join(process.cwd(),"quotation-pdf.cjs"))("pdf-lib");

let browser;
test.before(async()=>{browser=await chromium.launch({headless:true})});
test.after(async()=>{await browser?.close()});
const sample=()=>{
 const q=quotationCustomSample();
 q.termsText="1. Synthetic private test terms — never a customer contract.\n2. Reviewed wording must be provided before issue.";
 q.customerName="Synthetic customer K";
 q.customerPhone="+267 70 000 000";
 return q;
};
async function inspectPrint(q){
 const p=await browser.newPage({viewport:{width:1100,height:900},deviceScaleFactor:1});
 try{
  const {html}=renderLovelyFinalQuotationPrintHtml(q);
  await p.setContent(html,{waitUntil:"load"});
  await p.emulateMedia({media:"print"});
  await p.evaluate(()=>document.fonts.ready);
  const geometry=await p.evaluate(()=>[...document.querySelectorAll(".page")].map(el=>{
    const a=el.getBoundingClientRect();
    const boxes=[...el.querySelectorAll("*")];
    return {
      height:el.clientHeight,scrollHeight:el.scrollHeight,
      clipped:boxes.filter(x=>{
        const r=x.getBoundingClientRect();
        return r.bottom>a.bottom+1 || r.top<a.top-1 ||
          x.scrollHeight>x.clientHeight+2;
      }).map(x=>x.className||x.tagName)
    };
  }));
  return {pdf:await p.pdf({format:"A4",preferCSSPageSize:true,printBackground:true}),
   geometry,rows:await p.locator("article[data-page='1'] tbody tr").allInnerTexts(),
   text:await p.locator("body").innerText()};
 }finally{await p.close()}
}
test("final HTML print produces a real 2-page A4 PDF retaining editable customer and 9 separate rows",async()=>{
 const v=await inspectPrint(sample());
 const doc=await pdfLib.PDFDocument.load(v.pdf);
 assert.equal(doc.getPageCount(),2);
 for(const page of doc.getPages()){
   assert.ok(Math.abs(page.getWidth()-595.28)<1);
   assert.ok(Math.abs(page.getHeight()-841.89)<1);
 }
 assert.equal(v.rows.length,9);
 assert.match(v.rows[6],/^Concrete/);
 assert.match(v.rows[7],/^Grout 2kg/);
 assert.match(v.text,/Synthetic customer K/);
 assert.match(v.text,/\+267 70 000 000/);
 assert.match(v.text,/Synthetic private test terms/);
 assert.ok(v.geometry.every(x=>x.clipped.length===0),
 "Print PDF would silently clip text: "+JSON.stringify(v.geometry));
});
test("12 default-style items and representative terms remain within precisely 2 PDF pages",async()=>{
 const q=sample();while(q.items.length<12)
   q.items.push({description:"Synthetic additional material "+q.items.length,quantity:"1",unitPrice:"100.00"});
 const v=await inspectPrint(q);
 assert.equal((await pdfLib.PDFDocument.load(v.pdf)).getPageCount(),2);
 assert.equal(v.rows.length,12);
 assert.ok(v.geometry.every(x=>x.clipped.length===0),
  "12-row output clips print content: "+JSON.stringify(v.geometry));
});
test("detects excessively long terms as an overflow blocker, never as an accepted printable PDF",async()=>{
 const q=sample();q.termsText=Array(70).fill("Long synthetic contract sentence repeated to prove page-two clipping is detected.").join("\n");
 const v=await inspectPrint(q);
 assert.ok(v.geometry.some(x=>x.clipped.length>0||x.scrollHeight>x.height+2),
  "Expected browser geometry to identify overflowing contract text");
});
test("refuses absent terms before invoking Chromium",()=>{
 const q=sample();q.termsText="";
 assert.throws(()=>renderLovelyFinalQuotationPrintHtml(q),/terms_not_qualified/);
});

test("protected final HTML adapter makes real PDF bytes using isolated Chromium after tenant approval",async()=>{
 const {renderLovelyFinalQuotationPrivatePdf}=await import("../server/quotation-final-html-private-pdf.mjs");
 const {LOVELY_FINAL_HTML_REFERENCE}=await import("../server/quotation-final-html-contract.mjs");
 const draft=sample(),actor={id:"syntheticPdfEditor"};
 const result=await renderLovelyFinalQuotationPrivatePdf({
  actor,companyId:"syntheticTenant",draft,browser,pdfLib,
  sourceSha256:LOVELY_FINAL_HTML_REFERENCE.sourceSha256,
  authority:{assertPrivatePreview:async ({actor:a,companyId,mode})=>
   a===actor&&companyId==="syntheticTenant"&&mode==="synthetic-preview"}
 });
 assert.equal(result.pageCount,2);
 assert.equal(result.previewOnly,true);
 assert.ok(result.bytes.length>1000);
 assert.equal((await pdfLib.PDFDocument.load(result.bytes)).getPageCount(),2);
});


test("sanitized private PNG logo is visible twice in the actual A4 PDF preview DOM",async()=>{
 const {renderLovelyFinalQuotationPrivatePdf}=await import("../server/quotation-final-html-private-pdf.mjs");
 const {LOVELY_FINAL_HTML_REFERENCE}=await import("../server/quotation-final-html-contract.mjs");
 const actor={id:"syntheticLogoEditor"};
 const tinyPng=new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAALElEQVR42u3OIQEAAAgDMJKg6Z+HLhDjZmJ+tT2XVAICAgICAgICAgIC6cADRvhjW1wPDGYAAAAASUVORK5CYII=",
  "base64"));
 const watchedBrowser={
  newPage:async(...args)=>{
   const page=await browser.newPage(...args);
   const originalPdf=page.pdf.bind(page);
   page.pdf=async(options)=>{
    const images=page.locator("article.page .brand img");
    assert.equal(await images.count(),2);
    for(const node of await images.all()){
     assert.ok(await node.evaluate(img=>img.complete&&img.naturalWidth===32&&img.naturalHeight===24));
    }
    return originalPdf(options);
   };
   return page;
  }
 };
 const result=await renderLovelyFinalQuotationPrivatePdf({
  actor,companyId:"syntheticTenant",draft:sample(),browser:watchedBrowser,pdfLib,
  sourceSha256:LOVELY_FINAL_HTML_REFERENCE.sourceSha256,
  authority:{assertPrivatePreview:async({actor:a,companyId,mode})=>
   a===actor&&companyId==="syntheticTenant"&&mode==="synthetic-preview"},
  logoSource:{getPrivateCompanyLogo:async()=>({
   mimeType:"image/png",bytes:tinyPng,width:32,height:24,widthPercent:32,xPercent:0
  })}
 });
 assert.equal(result.pageCount,2);
 assert.equal((await pdfLib.PDFDocument.load(result.bytes)).getPageCount(),2);
});


test("signed-in preview loads the editor and prints two A4 pages without Browser Run",async()=>{
 const origin="https://quotation-preview.test";
 const path="/app/quotations/preview/";
 const response=await quotationBrowserPreview(new Request(origin+path,{headers:{cookie:"session=synthetic-owner"}}),{
   THEBE_QUOTATION_PREVIEW_TENANT_ID:"synthetic-lovely"
 },async()=>Response.json({user:{
   id:"synthetic-owner",tenantId:"synthetic-lovely",role:"owner",onboardingComplete:true
 }}));
 assert.equal(response.status,200);
 const page=await browser.newPage({viewport:{width:1280,height:960}});
 try{
  await page.addInitScript(()=>{window.printCalls=0;window.print=()=>{window.printCalls++}});
  const modules=new Set(["/js/quotation-customizable-page.mjs","/js/quotation-customizable-page-model.mjs"]);
  await page.route(origin+"/**",async route=>{
   const requestPath=new URL(route.request().url()).pathname;
   if(requestPath===path)return route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:await response.text()});
   if(!modules.has(requestPath))return route.abort();
   return route.fulfill({contentType:"text/javascript",body:await readFile(new URL("../public"+requestPath,import.meta.url))});
  });
  await page.goto(origin+path);
  await page.locator("textarea").fill("Synthetic contract terms for browser acceptance.");
  await page.getByRole("button",{name:"Print / Save PDF"}).click();
  assert.equal(await page.evaluate(()=>window.printCalls),1);
  await page.emulateMedia({media:"print"});
  const pdf=await pdfLib.PDFDocument.load(await page.pdf({format:"A4",preferCSSPageSize:true}));
  assert.equal(pdf.getPageCount(),2);
  for(const sheet of pdf.getPages()){
   assert.ok(Math.abs(sheet.getWidth()-595.28)<1);
   assert.ok(Math.abs(sheet.getHeight()-841.89)<1);
  }
  assert.match(await page.locator(".qcp-stage").innerText(),/Synthetic contract terms for browser acceptance/);
 }finally{await page.close()}
});


test("customer-ready browser print requires real fields and produces exactly two watermark-free A4 pages",async()=>{
 const origin="https://quotation-customer.test",path="/app/quotations/customer-ready/";
 const response=await quotationBrowserPreview(new Request(origin+path,{headers:{cookie:"session=synthetic-owner"}}),{
   THEBE_QUOTATION_PREVIEW_TENANT_ID:"synthetic-lovely"
 },async()=>Response.json({user:{
   id:"synthetic-owner",tenantId:"synthetic-lovely",role:"owner",onboardingComplete:true
 }}));
 assert.equal(response.status,200);
 const html=await response.text();
 const page=await browser.newPage({viewport:{width:1280,height:960}});
 try{
  await page.addInitScript(()=>{window.printCalls=0;window.print=()=>{window.printCalls++}});
  const modules=new Set(["/js/quotation-customizable-page.mjs","/js/quotation-customizable-page-model.mjs"]);
  await page.route(origin+"/**",async route=>{
   const requestPath=new URL(route.request().url()).pathname;
   if(requestPath===path)return route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:html});
   if(!modules.has(requestPath))return route.abort();
   return route.fulfill({contentType:"text/javascript",body:await readFile(new URL("../public"+requestPath,import.meta.url))});
  });
  await page.goto(origin+path);
  assert.equal(await page.locator(".qcp-page").count(),2);
  assert.equal(await page.locator(".qcp-watermark").count(),0);
  const print=page.getByRole("button",{name:"Print customer quotation / Save PDF"});
  // The mobile-friendly control stays clickable so it can explain why the
  // draft cannot print; verify the server-independent print action is denied.
  assert.equal(await print.isEnabled(),true);
  assert.match(await page.locator("#qcp-print-status").innerText(),/Customer quotation not ready:/);
  await print.click();
  assert.equal(await page.evaluate(()=>window.printCalls),0,"Sample draft must not invoke print");
  assert.match(await page.locator("#qcp-print-status").innerText(),/Cannot print yet:/);
  await page.getByLabel("Quote number",{exact:true}).fill("Q-2026-1001");
  await page.getByLabel("Customer name",{exact:true}).fill("Synthetic buyer");
  await page.getByLabel("Customer number",{exact:true}).fill("+267 72 111 222");
  await page.locator("details").filter({hasText:"Customize ALL document wording"}).locator("summary").click();
  await page.getByLabel("bank Account",{exact:true}).fill("123456789");
  assert.equal(await print.isEnabled(),true);
  await print.click();
  assert.equal(await page.evaluate(()=>window.printCalls),1);
  await page.emulateMedia({media:"print"});
  const pdf=await pdfLib.PDFDocument.load(await page.pdf({format:"A4",preferCSSPageSize:true,printBackground:true}));
  assert.equal(pdf.getPageCount(),2);
  for(const sheet of pdf.getPages()){
   assert.ok(Math.abs(sheet.getWidth()-595.28)<1);
   assert.ok(Math.abs(sheet.getHeight()-841.89)<1);
  }
  assert.match(await page.locator(".qcp-stage").innerText(),/Synthetic buyer/);
  assert.match(await page.locator(".qcp-terms").innerText(),/Customer Declaration/);
  assert.equal(await page.locator(".qcp-watermark").count(),0);
 }finally{await page.close()}
});


test("320/375/390/414/430px touch Chromium matrix keeps customer-ready quotation controls usable and draft print denied",async()=>{
  const origin="https://quotation-mobile.test";
  const path="/app/quotations/customer-ready/";
  const response=await quotationBrowserPreview(
    new Request(origin+path,{headers:{cookie:"session=synthetic-mobile-owner"}}),
    {THEBE_QUOTATION_PREVIEW_TENANT_ID:"synthetic-lovely"},
    async()=>Response.json({user:{
      id:"synthetic-mobile-owner",tenantId:"synthetic-lovely",
      role:"owner",onboardingComplete:true
    }})
  );
  assert.equal(response.status,200);
  const html=await response.text();
  const modules=new Set([
    "/js/quotation-customizable-page.mjs",
    "/js/quotation-customizable-page-model.mjs"
  ]);
  for(const width of [320,375,390,414,430]){
    const page=await browser.newPage({
      viewport:{width,height:844},deviceScaleFactor:2,
      isMobile:true,hasTouch:true
    });
    try{
      await page.addInitScript(()=>{
        window.printCalls=0;
        window.print=()=>{window.printCalls++};
      });
      await page.route(origin+"/**",async route=>{
        const requestPath=new URL(route.request().url()).pathname;
        if(requestPath===path)return route.fulfill({
          status:200,headers:Object.fromEntries(response.headers),body:html
        });
        if(!modules.has(requestPath))return route.abort();
        return route.fulfill({
          contentType:"text/javascript",
          body:await readFile(new URL("../public"+requestPath,import.meta.url))
        });
      });
      await page.goto(origin+path);
      assert.equal(await page.locator(".qcp-page").count(),2,
        "Expected two document sections at "+width+"px");
      assert.equal(await page.locator(".qcp-watermark").count(),0,
        "Customer-ready document must never include SAMPLE watermark at "+width+"px");
      const print=page.getByRole("button",{name:"Print customer quotation / Save PDF"});
      await print.waitFor({state:"visible"});
      assert.equal(await print.isEnabled(),true);
      const geometry=await print.evaluate(el=>{
        const b=el.getBoundingClientRect();
        return {
          width:b.width,height:b.height,left:b.left,right:b.right,
          viewport:document.documentElement.clientWidth
        };
      });
      assert.ok(geometry.height>=44&&geometry.width>=44,
        "Mobile print touch target too small at "+width+"px: "+JSON.stringify(geometry));
      assert.ok(geometry.left>=-1&&geometry.right<=geometry.viewport+1,
        "Mobile print control outside "+width+"px viewport: "+JSON.stringify(geometry));
      assert.match(
        await page.getByText("How to save as PDF on your phone").first().innerText(),
        /How to save as PDF on your phone/
      );
      await print.tap();
      assert.equal(await page.evaluate(()=>window.printCalls),0,
        "Sample draft must never trigger native printing at "+width+"px");
      assert.match(await page.locator("#qcp-print-status").innerText(),
        /Cannot print yet:/);
    }finally{await page.close()}
  }
});

test("200%-equivalent reflow widths keep private quotation controls accessible and sample print fail-closed",async()=>{
  // A halved CSS viewport is a responsive reflow proxy, NOT proof of real
  // desktop browser zoom. Real 200% zoom and Android sharing remain device gates.
  const origin="https://quotation-zoom-reflow.test";
  const path="/app/quotations/customer-ready/";
  const response=await quotationBrowserPreview(
    new Request(origin+path,{headers:{cookie:"session=synthetic-zoom-owner"}}),
    {THEBE_QUOTATION_PREVIEW_TENANT_ID:"synthetic-lovely"},
    async()=>Response.json({user:{
      id:"synthetic-zoom-owner",tenantId:"synthetic-lovely",
      role:"owner",onboardingComplete:true
    }})
  );
  assert.equal(response.status,200);
  const html=await response.text();
  const modules=new Set([
    "/js/quotation-customizable-page.mjs",
    "/js/quotation-customizable-page-model.mjs"
  ]);
  // Approximate a 1280px or 640px CSS viewport reduced by 200% zoom.
  for(const effectiveWidth of [640,320]){
    const page=await browser.newPage({
      viewport:{width:effectiveWidth,height:900},
      isMobile:false,hasTouch:false,deviceScaleFactor:1
    });
    try{
      await page.addInitScript(()=>{
        window.printCalls=0;
        window.print=()=>{window.printCalls++};
      });
      await page.route(origin+"/**",async route=>{
        const requestedPath=new URL(route.request().url()).pathname;
        if(requestedPath===path)return route.fulfill({
          status:200,headers:Object.fromEntries(response.headers),body:html
        });
        if(!modules.has(requestedPath))return route.abort();
        return route.fulfill({
          contentType:"text/javascript",
          body:await readFile(new URL("../public"+requestedPath,import.meta.url))
        });
      });
      await page.goto(origin+path);
      assert.equal(await page.locator(".qcp-page").count(),2);
      assert.equal(await page.locator(".qcp-watermark").count(),0);
      const print=page.getByRole("button",{name:"Print customer quotation / Save PDF"});
      await print.waitFor({state:"visible"});
      const geometry=await print.evaluate(el=>{
        const b=el.getBoundingClientRect();
        const sidebar=document.querySelector(".qcp-sidebar")?.getBoundingClientRect();
        return {left:b.left,right:b.right,height:b.height,width:b.width,
          viewport:document.documentElement.clientWidth,
          sidebarLeft:sidebar?.left,sidebarRight:sidebar?.right};
      });
      assert.ok(geometry.height>=44&&geometry.width>=44,
        "Reflow print control has undersized target at "+effectiveWidth+"px: "+JSON.stringify(geometry));
      assert.ok(geometry.left>=-1&&geometry.right<=geometry.viewport+1,
        "Reflow print control is off screen at "+effectiveWidth+"px: "+JSON.stringify(geometry));
      assert.ok(geometry.sidebarLeft>=-1&&geometry.sidebarRight<=geometry.viewport+1,
        "Reflow sidebar is off screen at "+effectiveWidth+"px: "+JSON.stringify(geometry));
      assert.match(await page.getByText("How to save as PDF on your phone").first().innerText(),
        /How to save as PDF on your phone/);
      await print.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(()=>window.printCalls),0,
        "Keyboard activation of sample quote must not print at "+effectiveWidth+"px");
      assert.match(await page.locator("#qcp-print-status").innerText(),
        /Cannot print yet:/);
      if(effectiveWidth===640){
        await page.getByLabel("Quote number",{exact:true}).fill("Q-2026-ZOOM");
        await page.getByLabel("Customer name",{exact:true}).fill("Synthetic zoom buyer");
        await page.getByLabel("Customer number",{exact:true}).fill("+267 72 111 222");
        await page.locator("details").filter({hasText:"Customize ALL document wording"}).locator("summary").click();
        await page.getByLabel("bank Account",{exact:true}).fill("123456789");
        await print.click();
        assert.equal(await page.evaluate(()=>window.printCalls),1,
          "Valid synthetic quote may open print after full data entry");
        await page.emulateMedia({media:"print"});
        const pdf=await pdfLib.PDFDocument.load(await page.pdf({
          format:"A4",preferCSSPageSize:true,printBackground:true
        }));
        assert.equal(pdf.getPageCount(),2,
          "Reflowed print must preserve two-page A4 document");
      }
    }finally{await page.close()}
  }
});
