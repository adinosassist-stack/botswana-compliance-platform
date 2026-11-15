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
