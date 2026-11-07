import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {handleNamibiaInternalCandidate} from "../cloudflare/src/namibia-internal-api-candidate.js";
import {marketActivationReadiness} from "../cloudflare/src/market-profile.js";
const base="https://internal.thebedesk.test";
const candidateDB={prepare(){throw new Error("candidate_database_should_not_be_called")},batch(){throw new Error("unexpected_write")}};
const authDB={prepare(){return {bind(){return {async first(){return null}}}}}};
const enabled={
 NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED:"1",
 NAMIBIA_INTERNAL_API_MODE:"isolated_candidate",
 NA_CANDIDATE_TENANT_ALLOWLIST:"synthetic-tenant-A",
 NA_CANDIDATE_DB:candidateDB,DB:authDB,SESSION_SECRET:"test-secret-not-production",
 PUBLIC_ORIGIN:base
};
const req=(path="/internal/namibia/evidence",options={})=>new Request(base+path,options);
test("internal Namibia adapter is not mounted in live worker or public routes",()=>{
 const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
 assert.doesNotMatch(worker,/namibia-internal-api-candidate/);
 assert.equal(marketActivationReadiness("NA").ready,false);
});
test("default closed, wrong mode closed, missing isolated DB closed",async()=>{
 for(const env of [{}, {...enabled,NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED:"0"},
  {...enabled,NAMIBIA_INTERNAL_API_MODE:"production"},
  {...enabled,NA_CANDIDATE_DB:null}]){
   const response=await handleNamibiaInternalCandidate(req(),env);
   assert.equal(response.status,404);
   assert.equal(response.headers.get("cache-control"),"no-store");
 }
});
test("active rehearsal requires a real server-side session before any read or write",async()=>{
 for(const request of [req(),req("/internal/namibia/entities",{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tenant_id:"synthetic-tenant-A",role:"owner"})
 })]){
  const response=await handleNamibiaInternalCandidate(request,enabled);
  assert.equal(response.status,401);
 }
});
test("unknown paths and wrong origin never reach storage",async()=>{
 const notFound=await handleNamibiaInternalCandidate(req("/internal/namibia/unexpected"),enabled);
 assert.equal(notFound.status,404);
 const foreign=await handleNamibiaInternalCandidate(new Request("https://wrong.test/internal/namibia/evidence"),enabled);
 assert.equal(foreign.status,403);
});
test("candidate implementation never accepts client-provided auth principal",()=>{
 const source=fs.readFileSync(new URL("../cloudflare/src/namibia-internal-api-candidate.js",import.meta.url),"utf8");
 assert.match(source,/authenticate\(request,env\)/);
 assert.match(source,/csrfAllowed\(request,auth\)/);
 assert.match(source,/originAllowed\(request,env\)/);
 assert.match(source,/NA_CANDIDATE_TENANT_ALLOWLIST/);
 assert.match(source,/rejectUntrustedIdentity\(body\)/);
 assert.match(source,/env\.NA_CANDIDATE_DB/);
 assert.doesNotMatch(source,/request\.headers\.get\("x-tenant-id"\)/);
});
