import test from "node:test";
import assert from "node:assert/strict";
import {quotationCustomSample} from "../public/js/quotation-customizable-page-model.mjs";
import {customQuotationToStoredDraft} from "../public/js/quotation-custom-workspace-bridge.mjs";
import {createFinalLovelyPrivatePdfPreviewHost} from "../server/quotation-final-html-private-preview-host.mjs";

const tenant="8c49e26a-48cd-411c-93a3-72809ba4f547";
const user="1bb00c70-5e59-4e66-b909-e0ea803da8d1";
const origin="https://quotation-preview.test";
const route=origin+"/api/quotation/final-html/pdf-preview";
const logo=new Uint8Array(Buffer.from(
 "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAALElEQVR42u3OIQEAAAgDMJKg6Z+HLhDjZmJ+tT2XVAICAgICAgICAgIC6cADRvhjW1wPDGYAAAAASUVORK5CYII=",
 "base64"));
const makeStored=()=>{
 const sample=quotationCustomSample();
 sample.quoteNumber="SYN-Q-01";sample.customerName="Synthetic Test";sample.termsText="Synthetic test-only terms.";
 return {revision:3,draft:customQuotationToStoredDraft(sample)}
};
const payload=(data={draftId:"synthetic1",revision:3},config={})=>
 new Request(route,{method:"POST",headers:{"content-type":"application/json",
 "origin":origin,"x-csrf-token":"synthetic-token"},body:JSON.stringify(data),...config});
const pdfLib={PDFDocument:{load:async()=>({
 getPageCount:()=>2,getPages:()=>[0,1].map(()=>({getSize:()=>({width:595.28,height:841.89})}))
})}};
function fixture(overrides={}){
 const events=[];
 const entry=makeStored();
 const page={
  async setContent(html){events.push("html");assert.match(html,/Grout 2kg/)},
  async emulateMedia(){events.push("printMode")},
  async evaluate(fn){return fn.toString().includes("document.fonts")?
   undefined:[{clipped:false,clientHeight:1100,scrollHeight:1090},
   {clipped:false,clientHeight:1100,scrollHeight:1080}]},
  async pdf(){events.push("pdf");return new Uint8Array([37,80,68,70,45,49])},
  async close(){events.push("closePage")}
 };
 const browser={newPage:async()=>{events.push("newPage");return page},
  close:async()=>events.push("closeBrowser")};
 const options={
  enabled:true,expectedTenantId:tenant,allowedPrivateOrigin:origin,
  readVerifiedSession:async()=>{events.push("session");return {
   authenticated:true,tenantId:tenant,userId:user,role:"owner"}},
  verifyActiveMembership:async()=>{events.push("membership");return {
   active:true,tenantId:tenant,userId:user,role:"owner"}},
  verifyMutation:async()=>{events.push("csrf");return true},
  verifyPrivateInvocation:async()=>{events.push("internal");return true},
  draftStore:{read:async({companyId,draftId})=>{
   events.push("draft");assert.equal(companyId,tenant);
   assert.equal(draftId,"synthetic1");return entry}},
  logoStore:{
   getCompanyLogoSettings:async({companyId})=>{
    events.push("logoSettings");assert.equal(companyId,tenant);
    return {companyId,logoAssetId:"syntheticLogo",
      layout:{widthPercent:32,xPercent:0}}},
   readPrivateAsset:async({companyId,logoAssetId})=>{
    events.push("logoRead");assert.equal(companyId,tenant);
    assert.equal(logoAssetId,"syntheticLogo");
    return {bytes:logo,mimeType:"image/png",width:32,height:24}}
  },
  authority:{assertPrivatePreview:async()=>{events.push("authorize");return true}},
  browserBinding:{synthetic:true},
  launchBrowser:async()=>{events.push("launch");return browser},
  pdfLib,...overrides
 };
 return {host:createFinalLovelyPrivatePdfPreviewHost(options),events,entry};
}
test("protected synthetic saved draft returns two-page preview PDF and closes browser",async()=>{
 const f=fixture();
 const out=await f.host.handleInternal(payload());
 assert.equal(out.status,200);
 assert.match(out.headers.get("content-type"),/application\/pdf/);
 assert.equal(out.headers.get("cache-control"),"private, no-store");
 assert.equal(out.headers.get("x-quotation-status"),"private-synthetic-preview-only");
 assert.equal((await out.arrayBuffer()).byteLength,6);
 assert.ok(f.events.indexOf("internal")<f.events.indexOf("session"));
 assert.ok(f.events.indexOf("csrf")<f.events.indexOf("draft"));
 assert.ok(f.events.indexOf("draft")<f.events.indexOf("logoRead"));
 assert.ok(f.events.indexOf("logoRead")<f.events.indexOf("launch"));
 assert.deepEqual(f.events.slice(-2),["closePage","closeBrowser"]);
});
test("unverified internal invocation denies before cookies, D1, R2 or Browser Run",async()=>{
 const f=fixture({verifyPrivateInvocation:async()=>false});
 const out=await f.host.handleInternal(payload());
 assert.equal(out.status,404);assert.deepEqual(f.events,[]);
});
test("denied session denies before draft, logo, and browser",async()=>{
 const f=fixture({readVerifiedSession:async()=>null});
 const out=await f.host.handleInternal(payload());
 assert.equal(out.status,401);
 assert.equal(f.events.includes("draft"),false);
});
test("staff cannot generate preview PDF",async()=>{
 const f=fixture({readVerifiedSession:async()=>({
  authenticated:true,tenantId:tenant,userId:user,role:"staff"
 }),verifyActiveMembership:async()=>({active:true,tenantId:tenant,userId:user,role:"staff"})});
 const out=await f.host.handleInternal(payload());
 assert.equal(out.status,403);assert.equal(f.events.includes("launch"),false);
});
test("wrong-tenant membership denied before reading draft",async()=>{
 const f=fixture({verifyActiveMembership:async()=>({active:true,tenantId:
  "3a59739e-5314-4b23-877e-4a3c4f04c050",userId:user,role:"owner"})});
 assert.equal((await f.host.handleInternal(payload())).status,403);
 assert.equal(f.events.includes("draft"),false);
});
test("bad or missing CSRF denies before body and draft",async()=>{
 const f=fixture({verifyMutation:async()=>false});
 assert.equal((await f.host.handleInternal(payload())).status,403);
 assert.equal(f.events.includes("draft"),false);
});
test("cross-origin/private route mismatch denied",async()=>{
 const f=fixture();
 const req=new Request("https://thebedesk.com/api/quotation/final-html/pdf-preview",{
 method:"POST",headers:{"origin":"https://thebedesk.com","content-type":"application/json"},
 body:JSON.stringify({draftId:"synthetic1",revision:3})});
 assert.equal((await f.host.handleInternal(req)).status,404);
 assert.equal(f.events.includes("session"),false);
});
test("invalid or excessive POST references never read draft",async()=>{
 const f=fixture();
 assert.equal((await f.host.handleInternal(payload({draftId:"synthetic1",
  revision:3,draft:{customerName:"Not permitted"}}))).status,400);
 assert.equal(f.events.includes("draft"),false);
});
test("stale revision refuses printing rather than rendering a different draft",async()=>{
 const f=fixture();
 assert.equal((await f.host.handleInternal(payload({draftId:"synthetic1",revision:2}))).status,404);
 assert.equal(f.events.includes("launch"),false);
});
test("missing custom wording or missing logo never produces PDF",async()=>{
 const f=fixture({logoStore:{
  getCompanyLogoSettings:async()=>null,readPrivateAsset:async()=>null
 }});
 assert.equal((await f.host.handleInternal(payload())).status,422);
 assert.equal(f.events.includes("launch"),false);
});
test("no public fetch export and disabled by default",async()=>{
 assert.throws(()=>createFinalLovelyPrivatePdfPreviewHost(),/host_unconfigured/);
 const m=await import("../server/quotation-final-html-private-preview-host.mjs");
 assert.equal("default" in m,false);
});
