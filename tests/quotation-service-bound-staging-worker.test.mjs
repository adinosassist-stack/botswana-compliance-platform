import test from "node:test";
import assert from "node:assert/strict";
import worker,{handleQuotationServiceBoundRequest} from "../server/quotation-service-bound-staging-worker.mjs";
const origin="https://quotation.internal.example.test";
const env={QUOTATION_PRIVATE_STAGE:"synthetic-internal-only",
 QUOTATION_PRIVATE_ORIGIN:origin,
 QUOTATION_PRIVATE_TENANT_ID:"123e4567-e89b-42d3-a456-426614174000",
 QUOTATION_PRIVATE_SESSION_SECRET:"session-secret-12345678901234567890",
 QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:"internal-secret-12345678901234567890",
 QUOTATION_BINDINGS_EXTERNALLY_VERIFIED:"exact-reviewed-staging-only",
 AUTH_DB:{prepare(){throw Error("unexpected db read")}},
 QUOTE_DB:{prepare(){throw Error("unexpected quote read")}}
};
const request=(path="/api/quotation/drafts",init={})=>new Request(origin+path,{
 ...init,headers:{"x-quotation-private-caller":env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET,...init.headers}
});
test("Worker has an actual default fetch, but denies missing service caller before D1",async()=>{
 assert.equal(typeof worker.fetch,"function");
 let reads=0;
 const fake={prepare(){reads++;throw Error("not allowed")}};
 const candidate={...env,AUTH_DB:fake,QUOTE_DB:{...fake}};
 const denied=await worker.fetch(new Request(origin+"/api/quotation/drafts"),candidate);
 assert.equal(denied.status,404);
 assert.equal(reads,0);
});
test("invalid staging identity, missing proof and public origin fail closed",async()=>{
 for(const changed of [
  {QUOTATION_PRIVATE_STAGE:"production"},
  {QUOTATION_BINDINGS_EXTERNALLY_VERIFIED:undefined},
  {QUOTATION_PRIVATE_ORIGIN:"https://thebedesk.com"},
  {QUOTE_DB:env.AUTH_DB}
 ]){
  const res=await handleQuotationServiceBoundRequest(request(),{...env,...changed});
  assert.equal(res.status,404);
 }
 const foreign=new Request("https://thebedesk.com/api/quotation/drafts",{
  headers:{"x-quotation-private-caller":env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET}
 });
 assert.equal((await worker.fetch(foreign,env)).status,404);
});
test("no customer issuance, PDF or logo routes",async()=>{
 for(const path of ["/api/quotation/issue","/api/quotation/draft/pdf-preview",
  "/api/quotation/logo/upload"]){
  const response=await worker.fetch(request(path),env);
  assert.equal(response.status,404);
 }
});
test("GET needs a verified session and never reads quotation D1 anonymously",async()=>{
 let calls=0;
 const auth={prepare(){calls++;return {bind(){return {async first(){return null}}}}}};
 const quote={prepare(){throw Error("anonymous quote read")}};
 const response=await worker.fetch(request(),{...env,AUTH_DB:auth,QUOTE_DB:quote});
 assert.equal(response.status,401);
 assert.equal(calls,0); // cookie absent: verifier does not query auth D1
});
