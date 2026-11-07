import assert from "node:assert/strict";
import test from "node:test";
import {checkNamibiaIsolatedEnvironment} from "../cloudflare/src/namibia-isolation-preflight.js";
import {handleNamibiaInternalCandidate} from "../cloudflare/src/namibia-internal-api-candidate.js";
const auth={prepare(){throw Error("authentication must never be reached")}};
const data={prepare(){throw Error("candidate data must never be reached")},batch(){throw Error("write must never be reached")}};
const good={
 NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED:"1",NAMIBIA_INTERNAL_API_MODE:"isolated_candidate",
 NAMIBIA_STAGE_KIND:"disposable_internal_test",NAMIBIA_BINDINGS_AUDITED:"1",
 NAMIBIA_SESSION_DB_ID:"synthetic-session-db",NAMIBIA_CANDIDATE_DB_ID:"synthetic-data-db",
 BOTSWANA_PRODUCTION_DB_ID:"synthetic-production-db",NA_CANDIDATE_TENANT_ALLOWLIST:"synthetic-A",
 DB:auth,NA_CANDIDATE_DB:data,SESSION_SECRET:"test-only-not-real",PUBLIC_ORIGIN:"https://na-internal.example.test"
};
test("explicit isolated rehearsal passes syntactic preflight but not independent binding audit",()=>{
 const r=checkNamibiaIsolatedEnvironment(good);
 assert.equal(r.ok,true);
 assert.equal(r.realBindingAuditStillRequired,true);
 assert.equal(r.customerActivationAllowed,false);
});
test("staging fails closed for production IDs, shared bindings, missing audit and real tenants",async()=>{
 const variants=[
  {NA_CANDIDATE_DB:auth},
  {NAMIBIA_SESSION_DB_ID:good.BOTSWANA_PRODUCTION_DB_ID},
  {NAMIBIA_CANDIDATE_DB_ID:good.BOTSWANA_PRODUCTION_DB_ID},
  {NAMIBIA_CANDIDATE_DB_ID:good.NAMIBIA_SESSION_DB_ID},
  {NAMIBIA_STAGE_KIND:"production"},
  {NAMIBIA_BINDINGS_AUDITED:"0"},
  {NA_CANDIDATE_TENANT_ALLOWLIST:"real-customer-tenant"},
  {NA_CANDIDATE_TENANT_ALLOWLIST:"synthetic-A,synthetic-A"},
  {NA_CANDIDATE_TENANT_ALLOWLIST:""}
 ];
 for(const variant of variants){
  const env={...good,...variant};
  assert.equal(checkNamibiaIsolatedEnvironment(env).ok,false,JSON.stringify(variant));
  const res=await handleNamibiaInternalCandidate(new Request("https://na-internal.example.test/internal/namibia/evidence?entityRef=X"),env);
  assert.equal(res.status,404);
 }
});
