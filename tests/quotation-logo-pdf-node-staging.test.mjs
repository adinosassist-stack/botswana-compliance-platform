import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createNodeStagingQuotationPdfPreviewHandler} from "../server/quotation-logo-pdf-node-staging.mjs";

const COMPANY="tenantA",LOGO="savedLogo";
const pdf=Uint8Array.from(Buffer.from("%PDF-1.7\nSTAGING TEST TEMPLATE"));
const image=Uint8Array.from([137,80,78,71,13,10,26,10,...Array(64).fill(0)]);
const digest=createHash("sha256").update(pdf).digest("hex");
const pages=[
 {width:612.24,height:858.96,logoZone:{x:0,y:0,width:320,height:250}},
 {width:841.92,height:1190.64,logoZone:{x:0,y:0,width:253,height:300}}
];
const actor={serverVerified:true};
function harness({tamper=false}={}){
 const key="quotation-logos/"+COMPANY+"/"+LOGO;
 const approvedTemplates={
  [COMPANY]:{companyId:COMPANY,id:"approved_v1",logoFree:true,
   privateObjectKey:"quotation-templates/"+COMPANY+"/approved_v1",
   sha256:digest,pages}
 };
 const calls={db:0,logo:0,template:0,draw:0};
 const db={prepare(sql){
  return {bind(...values){return {async first(){
   calls.db++;
   if(sql.includes("FROM quotation_logo_settings")){
    return values[0]===COMPANY?{tenant_id:COMPANY,asset_id:LOGO,
     x_percent:4,y_percent:2,width_percent:20}:null;
   }
   if(sql.includes("FROM quotation_logo_assets")){
    return values[0]===COMPANY&&values[1]===LOGO?{
     id:LOGO,object_key:key,mime_type:"image/png",width:200,height:100,aspect_ratio:2
    }:null;
   }
   throw Error("unrecognized select");
  }}}}
 }};
 const privateLogoBucket={
  async put(){throw Error("pdf_preview_must_not_write")},
  async get(k){calls.logo++;return k===key?{
   size:image.byteLength,arrayBuffer:async()=>image.buffer.slice(image.byteOffset,image.byteOffset+image.byteLength)
  }:null}
 };
 const privateTemplateBucket={async get(k){
  calls.template++;
  if(k!=="quotation-templates/"+COMPANY+"/approved_v1")return null;
  const b=tamper?Uint8Array.from(Buffer.from("%PDF-1.7\nTAMPERED")):pdf;
  return {size:b.byteLength,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}
 }};
 const authorization={
  assertCompanyReader:async({actor:a,companyId})=>a===actor&&companyId===COMPANY,
  assertCompanyEditor:async()=>true
 };
 const pdfLib={PDFDocument:{async load(input){
  assert.deepEqual(input,pdf);
  return {getPages:()=>pages.map(page=>({
   getSize:()=>({width:page.width,height:page.height}),
   drawImage:()=>{calls.draw++}
  })),embedPng:async()=>({}),save:async()=>pdf};
 }}};
 const preview=createNodeStagingQuotationPdfPreviewHandler({
  db,privateLogoBucket,privateTemplateBucket,approvedTemplates,authorization,pdfLib
 });
 const request=(companyId=COMPANY,a=actor)=>preview({
  actor:a,companyId,
  request:new Request("https://thebedesk.com/api/quotation/logo/pdf-preview")
 });
 return {request,calls};
}
test("staging composition loads private company logo and SHA-pinned PDF background",async()=>{
 const {request,calls}=harness();
 const response=await request();
 assert.equal(response.status,200);
 assert.equal(response.headers.get("content-type"),"application/pdf");
 assert.equal(calls.template,1);
 assert.ok(calls.logo>=1);
 assert.equal(calls.draw,2);
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),pdf);
});
test("unverified actor and other tenant cannot touch private bucket",async()=>{
 const h=harness();
 assert.equal((await h.request("tenantB")).status,403);
 assert.equal((await h.request(COMPANY,{serverVerified:false})).status,403);
 assert.equal(h.calls.logo,0);assert.equal(h.calls.template,0);assert.equal(h.calls.draw,0);
});
test("changed template fails integrity verification without any drawing",async()=>{
 const h=harness({tamper:true});
 const response=await h.request();
 assert.equal(response.status,422);
 assert.equal(h.calls.draw,0);
 assert.equal((await response.json()).error,"quotation_pdf_preview_unavailable");
});
test("missing PDF engine, templates or D1/R2 bindings fails closed at startup",()=>{
 const bads=[
  {},{db:{prepare(){}},privateLogoBucket:{get(){},put(){}},
   privateTemplateBucket:{get(){}},approvedTemplates:{},
   authorization:{assertCompanyReader(){},assertCompanyEditor(){}}}
 ];
 for(const args of bads)assert.throws(
  ()=>createNodeStagingQuotationPdfPreviewHandler(args),/staging_unconfigured/);
});
