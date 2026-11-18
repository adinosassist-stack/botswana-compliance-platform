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

test("private image loading requires proper binary type and bounded size",async()=>{
 const bytes=new Uint8Array(64);
 const api=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
  fetchImpl:async(url,options)=>{
   assert.equal(url,"/api/quotation/logo/image");
   assert.equal(options.credentials,"same-origin");
   return new Response(bytes,{headers:{"content-type":"image/png","cache-control":"no-store"}});
  }});
 const blob=await api.loadImage();
 assert.equal(blob.type,"image/png");assert.equal(blob.size,64);
 const bad=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
  fetchImpl:async()=>new Response(bytes,{headers:{"content-type":"text/html"}})});
 await assert.rejects(bad.loadImage(),/invalid_saved_logo_type/);
});

test("PDF preview only accepts authenticated bounded PDF response",async()=>{
 const pdf=Uint8Array.from(Buffer.from("%PDF-1.7\\nSafe preview"));
 const calls=[];
 const api=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
  fetchImpl:async(url,options)=>{
   calls.push({url,options});
   return new Response(pdf,{headers:{"content-type":"application/pdf","content-length":String(pdf.length)}});
  }});
 const blob=await api.previewPdf();
 assert.equal(blob.type,"application/pdf");
 assert.equal(blob.size,pdf.length);
 assert.equal(calls[0].url,"/api/quotation/logo/pdf-preview");
 assert.equal(calls[0].options.method,"GET");
 assert.equal(calls[0].options.credentials,"same-origin");
 assert.equal(calls[0].options.cache,"no-store");
 const bad=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
  fetchImpl:async()=>new Response("not a pdf",{headers:{"content-type":"application/pdf"}})});
 await assert.rejects(bad.previewPdf(),/invalid_quotation_pdf_payload/);
 const wrongMime=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
  fetchImpl:async()=>new Response(pdf,{headers:{"content-type":"text/html"}})});
 await assert.rejects(wrongMime.previewPdf(),/invalid_quotation_pdf_type/);
});

test("unknown-length PDF stream is rejected as soon as it crosses the cap",async()=>{
 let cancelled=false;
 const stream=new ReadableStream({
  pull(controller){
   controller.enqueue(new Uint8Array(6*1024*1024));
  },
  cancel(){cancelled=true}
 });
 const api=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
  fetchImpl:async()=>new Response(stream,{headers:{"content-type":"application/pdf"}})});
 await assert.rejects(api.previewPdf(),/download_exceeds_limit/);
 assert.equal(cancelled,true);
});
test("saved image streaming enforces size cap without Content-Length",async()=>{
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+1));c.close()}});
 const api=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
  fetchImpl:async()=>new Response(stream,{headers:{"content-type":"image/png"}})});
 await assert.rejects(api.loadImage(),/download_exceeds_limit/);
});
test("WebP cannot silently go to PNG-only API if browser conversion is absent",async()=>{
 const api=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
  fetchImpl:async()=>{throw Error("upload_should_not_run")}});
 await assert.rejects(api.upload(new Blob([new Uint8Array(64)],{type:"image/webp"})),/webp_conversion_unavailable/);
});


test("JPEG and WebP logos are normalized to safe PNG transport for portable staging",async()=>{
 const previousBitmap=globalThis.createImageBitmap,previousDocument=globalThis.document;
 const inputBytes=new Uint8Array(64).fill(65);
 const normalizedBytes=new Uint8Array(72).fill(137);
 let closed=0,conversions=0;
 try{
  globalThis.createImageBitmap=async()=>({width:240,height:120,close(){closed++}});
  globalThis.document={createElement(tag){
   assert.equal(tag,"canvas");
   return {getContext(kind){assert.equal(kind,"2d");return {drawImage(){}}},
    toBlob(callback,mime){assert.equal(mime,"image/png");conversions++;callback(new Blob([normalizedBytes],{type:"image/png"}))}};
  }};
  const calls=[];
  const api=createQuotationLogoHttpClient({enabled:true,csrfToken:token,fetchImpl:async(url,options)=>{
   calls.push({url,options});
   return new Response(JSON.stringify({ok:true,logoAssetId:"tenant_asset",aspectRatio:2}),{
    headers:{"content-type":"application/json"}});
  }});
  for(const mime of ["image/jpeg","image/webp"]){
   const saved=await api.upload(new Blob([inputBytes],{type:mime}));
   assert.equal(saved.logoAssetId,"tenant_asset");
  }
  assert.equal(conversions,2);
  assert.equal(closed,2);
  assert.equal(calls.length,2);
  for(const call of calls){
   assert.equal(call.url,"/api/quotation/logo/upload");
   assert.equal(call.options.headers["content-type"],"image/png");
   assert.equal(call.options.headers["x-csrf-token"],token);
   assert.equal(call.options.credentials,"same-origin");
   assert.equal(call.options.body.type,"image/png");
   assert.equal(call.options.body.size,normalizedBytes.length);
  }
 }finally{
  if(previousBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=previousBitmap;
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
 }
});
test("JPEG conversion errors fail without an unsafe upload",async()=>{
 const previousBitmap=globalThis.createImageBitmap,previousDocument=globalThis.document;
 try{
  globalThis.createImageBitmap=async()=>({width:240,height:120,close(){}});
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),
   toBlob:callback=>callback(new Blob([new Uint8Array(2*1024*1024+1)],{type:"image/png"}))})};
  const api=createQuotationLogoHttpClient({enabled:true,csrfToken:token,
   fetchImpl:async()=>{throw Error("network_must_not_be_called")}});
  await assert.rejects(api.upload(new Blob([new Uint8Array(64)],{type:"image/jpeg"})),/converted_logo_too_large/);
 }finally{
  if(previousBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=previousBitmap;
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
 }
});
