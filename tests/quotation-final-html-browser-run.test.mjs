import test from "node:test";
import assert from "node:assert/strict";
import {quotationCustomSample} from "../public/js/quotation-customizable-page-model.mjs";
import {renderLovelyFinalHtmlWithBrowserRun} from "../server/quotation-final-html-browser-run.mjs";

const actor={id:"synthetic-operator",tenantId:"tenantFixture"};
const companyId="tenantFixture";
const binding={kind:"test-browser-run-binding"};
const pdfBytes=new Uint8Array([37,80,68,70,45,49,46,51]);
const approved=()=>true;
const draft=()=>{const q=quotationCustomSample();q.termsText="Synthetic terms.\nNo customer issue.";return q};
const pdfLib={PDFDocument:{load:async()=>({
 getPageCount:()=>2,
 getPages:()=>[0,1].map(()=>({getSize:()=>({width:595.28,height:841.89})}))
})}};
function harness({geometry=[
 {clipped:false,clientHeight:1122,scrollHeight:1100},
 {clipped:false,clientHeight:1122,scrollHeight:1000}
],throwOnPdf=false}={}){
 const events=[];
 const page={
  setContent:async html=>{events.push("setContent");assert.match(html,/Grout 2kg/)},
  emulateMedia:async()=>events.push("print"),
  evaluate:async fn=>fn.toString().includes("document.fonts")?undefined:geometry,
  pdf:async()=>{events.push("pdf");if(throwOnPdf)throw Error("synthetic_pdf_error");return pdfBytes},
  close:async()=>events.push("pageClose")
 };
 const browser={newPage:async()=>{events.push("newPage");return page},
 close:async()=>events.push("browserClose")};
 return {events,browser,launchBrowser:async value=>{
   assert.equal(value,binding);events.push("launch");return browser;
 }};
}
function call(h,extra={}){
 return renderLovelyFinalHtmlWithBrowserRun({
  actor,companyId,draft:draft(),authority:{assertPrivatePreview:approved},
  verifyPrivateMutation:approved,browserBinding:binding,
  launchBrowser:h.launchBrowser,pdfLib,...extra
 });
}
test("authorized isolated tenant creates preview PDF and closes browser and page",async()=>{
 const h=harness(),out=await call(h);
 assert.equal(out.previewOnly,true);
 assert.equal(out.pageCount,2);
 assert.deepEqual([...out.bytes],[...pdfBytes]);
 assert.deepEqual(h.events,["launch","newPage","setContent","print","pdf","pageClose","browserClose"]);
});
test("wrong tenant fails before launch and private logo read",async()=>{
 const h=harness();let logoRead=false;
 await assert.rejects(call(h,{authority:{assertPrivatePreview:async()=>false},
 logoSource:{getPrivateCompanyLogo:async()=>{logoRead=true;throw Error("unexpected")}}}),/tenant_denied/);
 assert.deepEqual(h.events,[]);assert.equal(logoRead,false);
});
test("invalid CSRF denies before browser, logo read and document PDF",async()=>{
 const h=harness();await assert.rejects(call(h,{verifyPrivateMutation:async()=>false}),/csrf_denied/);
 assert.deepEqual(h.events,[]);
});
test("invalid runtime binding denies before launch",async()=>{
 const h=harness();
 await assert.rejects(call(h,{browserBinding:null}),/binding_unconfigured/);
 assert.deepEqual(h.events,[]);
});
test("missing reviewed terms closes browser after private auth",async()=>{
 const h=harness(),q=draft();q.termsText="";
 await assert.rejects(call(h,{draft:q}),/terms_not_qualified/);
 assert.deepEqual(h.events,["launch","browserClose"]);
});
test("oversized terms detected as clipped before pdf, browser always closed",async()=>{
 const h=harness({geometry:[
  {clipped:true,clientHeight:1122,scrollHeight:1200},
  {clipped:false,clientHeight:1122,scrollHeight:800}
 ]});
 await assert.rejects(call(h),/geometry_overflow/);
 assert.equal(h.events.includes("pdf"),false);
 assert.deepEqual(h.events.slice(-2),["pageClose","browserClose"]);
});
test("remote PDF exception does not leave Browser Run session open",async()=>{
 const h=harness({throwOnPdf:true});
 await assert.rejects(call(h),/synthetic_pdf_error/);
 assert.deepEqual(h.events.slice(-2),["pageClose","browserClose"]);
});
test("session returned without browser close contract refuses use",async()=>{
 const h=harness();h.launchBrowser=async()=>({newPage:async()=>{throw Error("must_not_reach")}});
 await assert.rejects(call(h),/launch_invalid/);
});
