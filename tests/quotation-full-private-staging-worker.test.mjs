import test from "node:test";
import assert from "node:assert/strict";
import candidate,{handleQuotationFullPrivateRequest}
 from "../server/quotation-full-private-staging-worker.mjs";
const origin="https://quotation.internal.example.test";
const tenant="123e4567-e89b-42d3-a456-426614174000";
const db={prepare(){throw Error("unexpected database read")}};
const storage={async get(){throw Error("unexpected storage read")},
 async put(){throw Error("unexpected storage write")},
 async delete(){throw Error("unexpected storage delete")}};
const env={
 QUOTATION_FULL_PDF_ENABLED:"approved-private-staging-only",
 QUOTATION_PRIVATE_STAGE:"synthetic-internal-only",
 QUOTATION_BINDINGS_EXTERNALLY_VERIFIED:"exact-reviewed-staging-only",
 QUOTATION_PRIVATE_ORIGIN:origin,
 QUOTATION_PRIVATE_TENANT_ID:tenant,
 QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:"staging-caller-secret-123456789abcdef",
 QUOTATION_PRIVATE_SESSION_SECRET:"different-staging-session-secret-12345",
 AUTH_DB:db,QUOTE_DB:{...db},LOGO_R2:storage,TEMPLATE_R2:storage,
 QUOTATION_PRIVATE_PDF_ENGINE:{PDFDocument:{
  async load(){throw Error("unexpected PDF load")},
  async create(){throw Error("unexpected PDF create")}
 }},
 QUOTATION_APPROVED_PRIVATE_TEMPLATE_JSON:JSON.stringify({
  [tenant]:{
   companyId:tenant,id:"lovely_b",logoFree:true,
   sha256:"8cdb4bf76230d04b8617f01d9c868ca00c518a2f75e10ed15e8ee1bbf332b87e",
   privateObjectKey:"quotation-templates/"+tenant+"/lovely_b",
   pages:[{width:612.24,height:858.96,logoZone:{x:10,y:10,width:30,height:30}},
          {width:841.92,height:1190.64,logoZone:{x:10,y:10,width:30,height:30}}]
  }
 })
};
test("private full-PDF candidate is disabled by default",async()=>{
 const req=new Request(origin+"/api/quotation/draft/pdf-preview",{method:"POST"});
 for(const e of [{},{...env,QUOTATION_FULL_PDF_ENABLED:undefined},
   {...env,QUOTATION_BINDINGS_EXTERNALLY_VERIFIED:undefined},
   {...env,QUOTATION_PRIVATE_PDF_ENGINE:undefined},
   {...env,QUOTATION_PRIVATE_ORIGIN:"https://thebedesk.com"}]){
  const response=await candidate.fetch(req,e);
  assert.equal(response.status,404);
  assert.equal(response.headers.get("cache-control"),"private, no-store");
 }
});
test("private final template requires exact approved immutable SHA and tenant",async()=>{
 const req=new Request(origin+"/api/quotation/drafts");
 const bad=JSON.parse(env.QUOTATION_APPROVED_PRIVATE_TEMPLATE_JSON);
 bad[tenant].sha256="0".repeat(64);
 assert.equal((await handleQuotationFullPrivateRequest(req,{
  ...env,QUOTATION_APPROVED_PRIVATE_TEMPLATE_JSON:JSON.stringify(bad)
 })).status,404);
 assert.equal((await handleQuotationFullPrivateRequest(req,{
  ...env,QUOTATION_APPROVED_PRIVATE_TEMPLATE_JSON:"{}"
 })).status,404);
});
test("valid isolated configuration still denies missing private caller before any data access",async()=>{
 const req=new Request(origin+"/api/quotation/draft/pdf-preview",{method:"POST"});
 const res=await candidate.fetch(req,env);
 assert.equal(res.status,404);
 assert.equal(await res.text(),"Not Found");
});
test("valid caller without a session cannot generate PDFs or access template storage",async()=>{
 const req=new Request(origin+"/api/quotation/logo/pdf-preview",{
  headers:{"x-quotation-private-caller":env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET}
 });
 const res=await candidate.fetch(req,env);
 assert.equal(res.status,401);
});
test("issuance and public origins are never available",async()=>{
 const headers={"x-quotation-private-caller":env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET};
 const issue=await candidate.fetch(new Request(origin+"/api/quotation/issue",{
  method:"POST",headers}),env);
 assert.equal(issue.status,404);
 const publicUrl=await candidate.fetch(new Request("https://thebedesk.com/api/quotation/draft/pdf-preview",{
  method:"POST",headers}),env);
 assert.equal(publicUrl.status,404);
});
