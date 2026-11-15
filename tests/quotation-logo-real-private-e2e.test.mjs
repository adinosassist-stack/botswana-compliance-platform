/**
 * Full synthetic PRIVATE staging pipeline using actual pdf-lib, Node sanitizer,
 * D1/R2 adapter, metadata persistence, SHA-pinned template, and HTTP handlers.
 *
 * No real Cloudflare resources, customer PDFs, browser sessions, or production.
 * Only run in isolated real PDF acceptance job with pinned pdf-lib installed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {createRequire} from "node:module";
import {createQuotationLogoStore} from "../server/quotation-logo-d1-r2-store.mjs";
import {createNodeStagingQuotationLogoHandler} from "../server/quotation-logo-node-staging.mjs";
import {createNodeStagingQuotationPdfPreviewHandler} from "../server/quotation-logo-pdf-node-staging.mjs";

const prefix=process.env.QUOTATION_PDF_ENGINE_ROOT;
if(!prefix)throw Error("quotation_full_private_e2e_requires_real_pdf_engine");
const pdfLib=createRequire(join(prefix,"quotation-e2e.cjs"))("pdf-lib");
const company="syntheticTenant",actor={verifiedSession:"syntheticOwner"},csrf="synthetic-csrf-token";
const PNG_SIGNATURE=Uint8Array.from([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let v=i;for(let bit=0;bit<8;bit++)v=(v&1)?0xedb88320^(v>>>1):v>>>1;
 return v>>>0;
});
function crc(bytes){let c=0xffffffff;for(const v of bytes)c=crcTable[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function put32(b,i,v){b[i]=(v>>>24)&255;b[i+1]=(v>>>16)&255;b[i+2]=(v>>>8)&255;b[i+3]=v&255}
function concat(parts){const sum=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(sum);let pos=0;
 for(const p of parts){out.set(p,pos);pos+=p.length}return out}
function chunk(name,data){
 const bytes=new Uint8Array(data.length+12);
 put32(bytes,0,data.length);bytes.set(Buffer.from(name),4);bytes.set(data,8);
 put32(bytes,bytes.length-4,crc(bytes.subarray(4,bytes.length-4)));
 return bytes;
}
function logoPng(){
 const width=32,height=24,ihdr=new Uint8Array(13);
 put32(ihdr,0,width);put32(ihdr,4,height);ihdr[8]=8;ihdr[9]=6;
 const pixels=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*(width*4+1)+1+x*4;
  pixels[at]=12;pixels[at+1]=75;pixels[at+2]=150;pixels[at+3]=255;
 }
 return concat([PNG_SIGNATURE,chunk("IHDR",ihdr),
  chunk("IDAT",new Uint8Array(deflateSync(pixels))),chunk("IEND",new Uint8Array())]);
}
const r2Value=data=>({size:data.byteLength,
 body:new ReadableStream({start(controller){controller.enqueue(data.slice());controller.close()}})
});
async function background(){
 const doc=await pdfLib.PDFDocument.create();
 const p1=doc.addPage([612.24,858.96]),p2=doc.addPage([841.92,1190.64]);
 const font=await doc.embedFont(pdfLib.StandardFonts.Helvetica);
 p1.drawText("Synthetic quotation background", {x:45,y:520,font,size:12});
 p2.drawText("Synthetic terms, not actual customer terms", {x:45,y:760,font,size:12});
 return new Uint8Array(await doc.save());
}
async function fixture(){
 const assets=new Map(),settings=new Map(),logoObjects=new Map(),events=[];
 const templateBytes=await background(),templateKey="quotation-templates/"+company+"/synthetic_clean_v1";
 let privateTemplateData=templateBytes;
 const db={prepare(sql){return{bind(...values){return{
  async first(){
   events.push("d1_read");
   if(sql.includes("FROM quotation_logo_assets"))return assets.get(values[0]+":"+values[1])||null;
   if(sql.includes("FROM quotation_logo_settings"))return settings.get(values[0])||null;
   throw Error("unexpected_d1_select");
  },
  async run(){
   if(sql.startsWith("INSERT INTO quotation_logo_assets")){
    const [id,tenant,object_key,mime_type,width,height,aspect_ratio]=values;
    assets.set(tenant+":"+id,{id,object_key,mime_type,width,height,aspect_ratio});
    events.push("d1_insert_logo");return {success:true};
   }
   if(sql.startsWith("INSERT INTO quotation_logo_settings")){
    const [tenant,asset,x,y,w]=values;
    settings.set(tenant,{tenant_id:tenant,asset_id:asset,x_percent:x,y_percent:y,width_percent:w});
    events.push("d1_upsert_settings");return {success:true};
   }
   throw Error("unexpected_d1_write");
  }
 }};}
 };}
 };
 const privateLogoBucket={
  async put(key,bytes){logoObjects.set(key,bytes.slice());events.push("r2_logo_put")},
  async get(key){events.push("r2_logo_get");const data=logoObjects.get(key);return data?r2Value(data):null},
  async delete(key){logoObjects.delete(key);events.push("r2_logo_delete")}
 };
 const privateTemplateBucket={
  async get(key){events.push("r2_template_get");
   return key===templateKey?r2Value(privateTemplateData):null}
 };
 const auth={
  assertCompanyEditor:async({actor:a,companyId:id})=>a===actor&&id===company,
  assertCompanyReader:async({actor:a,companyId:id})=>a===actor&&id===company
 };
 const verifyMutation=async({request})=>request.headers.get("x-csrf-token")===csrf;
 const store=createQuotationLogoStore({db,bucket:privateLogoBucket});
 const upload=createNodeStagingQuotationLogoHandler({
  authorization:auth,store,verifyMutation
 });
 const pages=[
  {width:612.24,height:858.96,logoZone:{x:0,y:0,width:320,height:250}},
  {width:841.92,height:1190.64,logoZone:{x:0,y:0,width:253,height:300}}
 ];
 const approvedTemplates={
  [company]:{
   companyId:company,id:"synthetic_clean_v1",logoFree:true,
   privateObjectKey:templateKey,
   sha256:createHash("sha256").update(templateBytes).digest("hex"),pages
  }
 };
 const preview=createNodeStagingQuotationPdfPreviewHandler({
  db,privateLogoBucket,privateTemplateBucket,approvedTemplates,
  authorization:auth,pdfLib,verifyMutation
 });
 const call=(handler,path,init={},identity={})=>handler({
  request:new Request("https://thebedesk.com"+path,init),
  actor,companyId:company,...identity
 });
 return {call,upload,preview,events,logoObjects,assets,settings,
  tamperTemplate:()=>{privateTemplateData=new Uint8Array(Buffer.from("%PDF-1.7\nTAMPERED"))}};
}
async function setupLogo(f){
 const uploaded=await f.call(f.upload,"/api/quotation/logo/upload",{
  method:"POST",
  headers:{"content-type":"image/png","x-csrf-token":csrf},
  body:logoPng()
 });
 assert.equal(uploaded.status,201);
 const data=await uploaded.json();
 assert.equal(data.aspectRatio,32/24);
 const saved=await f.call(f.upload,"/api/quotation/logo",{
  method:"PUT",
  headers:{"content-type":"application/json","x-csrf-token":csrf},
  body:JSON.stringify({logoAssetId:data.logoAssetId,aspectRatio:data.aspectRatio,
   layout:{xPercent:4,yPercent:2,widthPercent:20}})
 });
 assert.equal(saved.status,200);
 return data;
}
const draft=()=>({
 quoteNumber:"SYNTHETIC-Q-1",issueDate:"2026-11-15",
 customerName:"Synthetic Customer",customerContact:"Gaborone Test Only",
 items:[{description:"Granite memorial",quantity:2,unitPriceCents:125050},
  {description:"Installation",quantity:1,unitPriceCents:350000}],
 discountCents:10050,paymentMethod:"Manual payment"
});
const requestBody=(body=draft(),token=csrf)=>({
 method:"POST",headers:{"content-type":"application/json","x-csrf-token":token},
 body:JSON.stringify(body)
});
test("full private staging pipeline: upload -> sanitize -> D1 -> R2 -> settings -> real 2-page PDF",async()=>{
 const f=await fixture();
 const logo=await setupLogo(f);
 assert.equal(f.assets.size,1);
 assert.equal(f.settings.size,1);
 assert.equal(f.logoObjects.size,1);
 const privateBytes=[...f.logoObjects.values()][0];
 assert.notDeepEqual(privateBytes,logoPng(),"original PNG is sanitized and re-encoded");
 const before=f.events.length;
 const response=await f.call(f.preview,"/api/quotation/draft/pdf-preview",requestBody());
 assert.equal(response.status,200,await response.clone().text().then(v=>v.slice(0,250)));
 assert.equal(response.headers.get("cache-control"),"private, no-store");
 assert.equal(response.headers.get("content-type"),"application/pdf");
 const document=await pdfLib.PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
 assert.equal(document.getPageCount(),2);
 const p1=document.getPage(0),p2=document.getPage(1);
 assert.deepEqual(p1.getSize(),{width:612.24,height:858.96});
 assert.deepEqual(p2.getSize(),{width:841.92,height:1190.64});
 for(const page of [p1,p2]){
  const images=page.node.Resources().lookup(pdfLib.PDFName.of("XObject"),pdfLib.PDFDict);
  assert.ok(images.keys().length>=1,"saved private company logo embedded");
 }
 assert.equal(f.events.slice(before).filter(x=>/put|insert|upsert|delete/.test(x)).length,0,
  "generating the draft must not write data");
 assert.equal(logo.logoAssetId.length,32);
});
test("other tenant and forged CSRF cannot load private bytes or render a PDF",async()=>{
 const f=await fixture();
 await setupLogo(f);
 const before=f.events.length;
 const cross=await f.call(f.preview,"/api/quotation/draft/pdf-preview",
  requestBody(),{companyId:"otherTenant"});
 assert.equal(cross.status,403);
 const wrongToken=await f.call(f.preview,"/api/quotation/draft/pdf-preview",
  requestBody(draft(),"invalid"));
 assert.equal(wrongToken.status,403);
 assert.equal(f.events.length,before,"reject before any D1 or R2 operation");
});
test("tampering with approved PDF bytes denies preview without saving anything",async()=>{
 const f=await fixture();
 await setupLogo(f);
 const before=f.events.length;
 f.tamperTemplate();
 const denied=await f.call(f.preview,"/api/quotation/draft/pdf-preview",requestBody());
 assert.equal(denied.status,422);
 assert.equal((await denied.json()).error,"quotation_draft_pdf_preview_unavailable");
 assert.equal(f.events.slice(before).filter(x=>/put|insert|upsert|delete/.test(x)).length,0);
});
