import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createApprovedQuotationTemplateProvider} from "../server/quotation-logo-template-provider.mjs";
const sample=Uint8Array.from(Buffer.from("%PDF-1.7\nSTAGING LOGO-FREE TEMPLATE FIXTURE"));
const hash=createHash("sha256").update(sample).digest("hex");
const pages=[
 {width:612.24,height:858.96,logoZone:{x:0,y:0,width:612.24,height:858.96}},
 {width:841.92,height:1190.64,logoZone:{x:0,y:0,width:252.576,height:300}}
];
function provider(override={},blob=sample){
 const entry={id:"lovely_clean_v1",companyId:"lovelyA",logoFree:true,
  privateObjectKey:"quotation-templates/lovelyA/lovely_clean_v1",sha256:hash,pages,...override};
 return createApprovedQuotationTemplateProvider({
  registry:{lovelyA:entry},
  privateStore:{get:async()=>({size:blob.byteLength,arrayBuffer:async()=>blob.buffer.slice(blob.byteOffset,blob.byteOffset+blob.byteLength)})}
 });
}
test("known company retrieves approved integrity-checked private bytes",async()=>{
 const t=await provider().getApprovedLogoFreeTemplate({companyId:"lovelyA"});
 assert.equal(t.pageCount,2);assert.equal(t.logoFree,true);assert.equal(t.bytes.length,sample.length);
});
test("private tenancy is enforced before object lookup",async()=>{
 await assert.rejects(provider().getApprovedLogoFreeTemplate({companyId:"another"}),/quotation_template_not_approved/);
 await assert.rejects(provider({privateObjectKey:"quotation-templates/other/x"}).getApprovedLogoFreeTemplate({companyId:"lovelyA"}),/quotation_template_not_approved/);
});
test("modified bytes and invalid digest are rejected",async()=>{
 await assert.rejects(provider({},Uint8Array.from(Buffer.from("%PDF-1.7\nALTERED"))).getApprovedLogoFreeTemplate({companyId:"lovelyA"}),/integrity_failed/);
 await assert.rejects(provider({sha256:"0".repeat(64)}).getApprovedLogoFreeTemplate({companyId:"lovelyA"}),/integrity_failed/);
});
test("unverified logo-free claim or invalid header zone is rejected",async()=>{
 await assert.rejects(provider({logoFree:false}).getApprovedLogoFreeTemplate({companyId:"lovelyA"}),/not_approved/);
 await assert.rejects(provider({pages:[pages[0],{...pages[1],logoZone:{x:700,y:0,width:200,height:200}}]}).getApprovedLogoFreeTemplate({companyId:"lovelyA"}),/not_approved/);
});

test("template approval cannot be inherited via prototype of registry object",async()=>{
 const inherited={id:"lovely_clean_v1",companyId:"lovelyA",logoFree:true,
  privateObjectKey:"quotation-templates/lovelyA/lovely_clean_v1",sha256:hash,pages};
 let storageRead=false;
 const provider=createApprovedQuotationTemplateProvider({
  registry:Object.create({lovelyA:inherited}),
  privateStore:{get:async()=>{storageRead=true;throw Error("unexpected_read")}}
 });
 await assert.rejects(provider.getApprovedLogoFreeTemplate({companyId:"lovelyA"}),/not_approved/);
 assert.equal(storageRead,false);
});
test("template private key cannot escape the exact tenant-scoped leaf directory",async()=>{
 const examples=["quotation-templates/lovelyA/../secret",
  "quotation-templates/lovelyA/child/secret",
  "quotation-templates/lovelyA/",
  "quotation-templates/lovelyA/a%2Fb",
  "quotation-templates/other/asset"];
 for(const key of examples){
  await assert.rejects(provider({privateObjectKey:key}).getApprovedLogoFreeTemplate({
   companyId:"lovelyA"
  }),/not_approved/);
 }
});
