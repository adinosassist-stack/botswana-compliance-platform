import test from "node:test";
import assert from "node:assert/strict";
import * as host from "../server/quotation-private-service-binding-host.mjs";

const expected={
 account:"ddd23cab31928a4bb3d4998df9b26d1d",
 worker:"bcaaf366ef7349a1a76a3a66735cb3af",
 authDbId:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteDbId:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoBucket:"bw-quotation-logo-private-staging",
 templateBucket:"bw-quotation-template-private-staging",
 verifiedByIndependentPreflight:true,publicAndPreviewUrlsDisabled:true,
 productionBindingsAbsent:true,currentSourceApproved:true
};
const db={prepare(){return {bind(){return {async first(){return null}}}}}};
const bucket={async get(){return null},async put(){},async delete(){}};
const pdfLib={PDFDocument:{load:async()=>({}),create:async()=>({})}};
const env={
 QUOTATION_PRIVATE_STAGE:"synthetic-internal-only",
 QUOTATION_PRIVATE_ORIGIN:"https://quotation.internal.example.test",
 QUOTATION_PRIVATE_TENANT_ID:"123e4567-e89b-42d3-a456-426614174000",
 QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:"caller-secret-that-is-long-enough-123456",
 QUOTATION_PRIVATE_SESSION_SECRET:"session-secret-that-is-long-enough-12345",
 AUTH_DB:db,QUOTE_DB:{...db},LOGO_R2:bucket,TEMPLATE_R2:bucket
};
const config={env,resourceProof:expected,pdfLib,approvedTemplates:{}};
test("no default public fetch entrypoint",()=>assert.equal(typeof host.default,"undefined"));
test("missing independent proof, wrong resource ID, or public URL fails closed",()=>{
 for(const resourceProof of [undefined,{...expected,verifiedByIndependentPreflight:false},
  {...expected,worker:"wrong"}, {...expected,publicAndPreviewUrlsDisabled:false},
  {...expected,productionBindingsAbsent:false}, {...expected,currentSourceApproved:false}]){
  assert.throws(()=>host.createQuotationPrivateServiceBindingHost({...config,resourceProof}),/not_qualified/);
 }
 for(const origin of ["https://thebedesk.com","http://quotation.internal.example.test",
   "https://quotation.internal.example.test.evil.com"]){
  assert.throws(()=>host.createQuotationPrivateServiceBindingHost({
   ...config,env:{...env,QUOTATION_PRIVATE_ORIGIN:origin}
  }),/not_qualified/);
 }
});
test("correctly constructed host still denies missing internal caller before D1 reads",async()=>{
 let reads=0;
 const guardedDb={prepare(){reads++;return db.prepare()}};
 const instance=host.createQuotationPrivateServiceBindingHost({
  ...config,env:{...env,AUTH_DB:guardedDb}
 });
 const res=await instance.handleInternal(new Request(
  "https://quotation.internal.example.test/api/quotation/drafts?id=test"
 ));
 assert.equal(res.status,404);
 assert.equal(reads,0);
});
