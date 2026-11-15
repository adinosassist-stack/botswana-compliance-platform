import test from "node:test";
import assert from "node:assert/strict";
import {createQuotationLogoHttpClient,mountCompanyQuotationLogoEditor} from "../public/js/quotation-logo-api-client.mjs";
const token="csrf-token-test-123456";
test("client refuses disabled, missing CSRF and missing authentication capability",async()=>{
 assert.throws(()=>createQuotationLogoHttpClient({enabled:false,fetchImpl:async()=>{}}),/feature_disabled/);
 assert.throws(()=>createQuotationLogoHttpClient({enabled:true,fetchImpl:async()=>{}}),/client_unconfigured/);
 await assert.rejects(mountCompanyQuotationLogoEditor(null,{capability:{enabled:true,authenticated:false}}),/feature_disabled/);
});
test("client uses same-origin, CSRF, controlled URLs and does not transmit company claim",async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return new Response(JSON.stringify({ok:true,settings:null,logoAssetId:"l1",aspectRatio:2}),
   {status:200,headers:{"content-type":"application/json"}});
 };
 const api=createQuotationLogoHttpClient({enabled:true,fetchImpl,csrfToken:token});
 await api.load();
 await api.upload(new Blob([new Uint8Array(64)],{type:"image/png"}));
 await api.save({companyId:"untrusted-company",logoAssetId:"l1",aspectRatio:2,layout:{xPercent:4,yPercent:2,widthPercent:30}});
 assert.deepEqual(calls.map(x=>x.url),["/api/quotation/logo","/api/quotation/logo/upload","/api/quotation/logo"]);
 assert.ok(calls.every(x=>x.options.credentials==="same-origin"&&x.options.cache==="no-store"));
 assert.equal(calls[1].options.headers["x-csrf-token"],token);
 assert.equal(calls[2].options.headers["x-csrf-token"],token);
 assert.equal(JSON.parse(calls[2].options.body).companyId,undefined);
});
test("rejects SVG and bad server responses",async()=>{
 const api=createQuotationLogoHttpClient({enabled:true,csrfToken:token,fetchImpl:async()=>new Response("oops",{status:200})});
 await assert.rejects(api.upload(new Blob([new Uint8Array(64)],{type:"image/svg+xml"})),/unsupported_logo_type/);
 await assert.rejects(api.load(),/invalid_logo_api_response/);
});
