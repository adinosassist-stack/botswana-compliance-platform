import test from "node:test";
import assert from "node:assert/strict";
import {handleQuotationLogoHttp} from "../server/quotation-logo-http.mjs";
const companyId="companyA",actor={session:"resolved-server-side"};
const counters={upload:0,save:0};
const authorization={assertCompanyEditor:async()=>true,assertCompanyReader:async()=>true};
const asset={aspectRatio:2,bytes:Uint8Array.from([137,80,78,71,13,10,26,10,...new Array(100).fill(0)]),mimeType:"image/png"};
const store={
 writePrivateAsset:async()=>{counters.upload++;return {logoAssetId:"asset1"}},
 readPrivateAsset:async()=>asset,
 upsertCompanyLogoSettings:async()=>{counters.save++},
 getCompanyLogoSettings:async()=>null
};
const call=(url,init={},extra={})=>handleQuotationLogoHttp({
 request:new Request("https://thebedesk.com"+url,init),actor,companyId,
 authorization,store,verifyMutation:async()=>true,...extra
});
test("upload refuses request when no CSRF check or image processor is connected",async()=>{
 const bytes=asset.bytes;
 const a=await call("/api/quotation/logo/upload",{method:"POST",headers:{"content-type":"image/png"},body:bytes},{verifyMutation:undefined});
 assert.equal(a.status,403);
 const b=await call("/api/quotation/logo/upload",{method:"POST",headers:{"content-type":"image/png"},body:bytes});
 assert.equal(b.status,503);
 assert.equal(counters.upload,0);
});
test("upload uses sanitized server-returned metadata rather than client headers",async()=>{
 const response=await call("/api/quotation/logo/upload",{method:"POST",headers:{"content-type":"image/png","x-image-width":"99999"},body:asset.bytes},{
 decodeAndSanitizeLogo:async()=>({type:"image/png",bytes:asset.bytes,width:200,height:100})
 });
 assert.equal(response.status,201);
 assert.equal((await response.json()).logoAssetId,"asset1");
 assert.equal(counters.upload,1);
});
test("server never derives tenant or actor from JSON body and rejects extra fields",async()=>{
 const response=await call("/api/quotation/logo",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
  companyId:"other",logoAssetId:"asset1",aspectRatio:2,layout:{xPercent:4,yPercent:2,widthPercent:34}
 })});
 assert.equal(response.status,400);assert.equal(counters.save,0);
});
test("no access with missing authenticated actor",async()=>{
 const response=await call("/api/quotation/logo",{method:"GET"},{actor:null});
 assert.equal(response.status,403);
});

test("oversized streaming upload rejected before image processor receives bytes",async()=>{
 let processed=false;
 const huge=new Uint8Array(2*1024*1024+10);
 huge.set(asset.bytes);
 const reply=await call("/api/quotation/logo/upload",{method:"POST",headers:{"content-type":"image/png"},body:huge},{
  decodeAndSanitizeLogo:async()=>{processed=true;throw Error("should_not_process")}
 });
 assert.equal(reply.status,413);
 assert.equal(processed,false);
});
test("oversized settings payload and malformed JSON return structured errors",async()=>{
 const huge=await call("/api/quotation/logo",{method:"PUT",headers:{"content-type":"application/json"},body:"x".repeat(5000)});
 assert.equal(huge.status,413);
 const broken=await call("/api/quotation/logo",{method:"PUT",headers:{"content-type":"application/json"},body:'{"logoAssetId":'});
 assert.equal(broken.status,400);
 assert.equal((await broken.json()).error,"invalid_logo_settings");
});

test("saved image read is private and scoped to authenticated company",async()=>{
 const imageStore={...store,
  getCompanyLogoSettings:async()=>({companyId,logoAssetId:"asset1",
   layout:{xPercent:4,yPercent:2,widthPercent:34}})};
 const result=await call("/api/quotation/logo/image",{method:"GET"},{store:imageStore});
 assert.equal(result.status,200);
 assert.equal(result.headers.get("content-type"),"image/png");
 assert.equal(result.headers.get("cache-control"),"private, no-store");
 assert.equal(result.headers.get("x-content-type-options"),"nosniff");
 assert.deepEqual(new Uint8Array(await result.arrayBuffer()),asset.bytes);
 const denied=await call("/api/quotation/logo/image",{method:"GET"},{store:imageStore,
  authorization:{...authorization,assertCompanyReader:async()=>false}});
 assert.equal(denied.status,403);
 const other=await call("/api/quotation/logo/image",{method:"GET"},{store:{
  ...imageStore,getCompanyLogoSettings:async()=>({companyId:"other",logoAssetId:"asset1",
   layout:{xPercent:4,yPercent:2,widthPercent:34}})}});
 assert.equal(other.status,500);
});
