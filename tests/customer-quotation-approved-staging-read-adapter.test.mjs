import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createC4ApprovedQuotationStagingReadAdapter as create,
 C4_READ_APPROVED_STAGING_QUOTATION_SQL as SQL,
 C4_APPROVED_QUOTATION_SOURCE_CONTRACT as CONTRACT
} from "../server/essentials-private-approved-quotation-staging-read-adapter.mjs";
import {
 createC4AuthoritativeQuotationPublicationBridge as createPublication
} from "../server/essentials-private-business-quotation-publication-bridge.mjs";
const te=new TextEncoder();
const quote=te.encode("C4 approved quotation exact BWP 130.00");
const terms=te.encode("All customer terms including notice, cancellation and refund");
const sha=async bytes=>[...new Uint8Array(await webcrypto.subtle.digest("SHA-256",bytes))]
 .map(x=>x.toString(16).padStart(2,"0")).join("");
const scope={tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA"};
const validRow=async()=>({
 tenant_id:"tenantA",customer_id:"customerA",quotation_id:"quoteA",
 quotation_reference:"Q_130",approval_evidence_id:"approvalA",
 approved_by_actor_user_id:"ownerA",acceptance_version:2,
 total_minor:13000,currency:"BWP",approved_at_ms:1795190400000,
 quotation_sha256:await sha(quote),terms_sha256:await sha(terms),
 immutable_quotation_bytes:[...quote],immutable_terms_bytes:[...terms]
});
async function setup({row=await validRow(),bound=true,approved=true,queryError=false}={}){
 const state={checks:[],bindingChecks:0,authorityChecks:0};
 const db={prepare(sql){assert.equal(sql,SQL);return{bind(...args){
  state.checks.push(args);
  return{async first(){if(queryError)throw Error("D1 down");return row}};
 }}}};
 const reader=create({
  enabled:true,environment:"essentials-private-staging",db,
  cryptoSubtle:webcrypto.subtle,
  verifyBoundQuotationDb:async meta=>{
   state.bindingChecks++;
   assert.equal(meta.id,"aec227e9-b0f2-4b00-8de0-105465c4e2d6");
   assert.equal(meta.name,"bw-quotation-staging");
   assert.equal(meta.db,db);
   return bound;
  },
  verifyIndependentBusinessApproval:async source=>{
   state.authorityChecks++;
   assert.equal(source.tenantId,"tenantA");
   assert.equal(source.quotationReference,"Q_130");
   return approved;
  }
 });
 return {reader,state,db};
}
test("isolated read adapter disabled by default and never authorizes login, database writes or real Finance provenance",()=>{
 assert.throws(()=>create(),/c4_approved_quotation_source_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),/c4_approved_quotation_source_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),/c4_approved_quotation_source_unconfigured/);
 assert.equal(CONTRACT.registryMigrationApplied,false);
 assert.equal(CONTRACT.independentlyApprovedBusinessSourceConnected,false);
 assert.equal(CONTRACT.productionDbBound,false);
 assert.equal(CONTRACT.customerLoginEnabled,false);
 assert.equal(CONTRACT.cloudWriteAuthorized,false);
 assert.match(SQL,/JOIN c4_quotation_approval_assertions/);
 assert.match(SQL,/LEFT JOIN c4_quotation_approval_revocations/);
 assert.match(SQL,/r\.tenant_id IS NULL/);
 assert.doesNotMatch(SQL,/\b(UPDATE|INSERT|DELETE|DROP|ALTER)\b/i);
});
test("approved read requires exact tenant, customer, quote, immutable bytes and separate authority",async()=>{
 const f=await setup();
 const result=await f.reader.loadApprovedBusinessQuotation(scope);
 assert.deepEqual(f.state.checks,[["tenantA","customerA","quoteA"]]);
 assert.equal(f.state.bindingChecks,1);
 assert.equal(f.state.authorityChecks,1);
 assert.equal(result?.state,"approved-for-issuance");
 assert.equal(result?.sourceVerified,true);
 assert.equal(result?.completeApprovedTerms,true);
 assert.equal(result?.totalMinor,13000);
 assert.deepEqual(result?.immutableQuotationBytes,quote);
 assert.deepEqual(result?.immutableTermsBytes,terms);
 assert.notStrictEqual(result.immutableQuotationBytes,quote);
 assert.equal(Object.hasOwn(result,"email"),false);
 assert.equal(Object.hasOwn(result,"customerLoginEnabled"),false);
});
test("invalid customer, tenant and quote IDs reject before any DB query",async()=>{
 const f=await setup();
 for(const bad of [
  {...scope,tenantId:"tenant/b"},
  {...scope,customerId:null},
  {...scope,quotationId:"quote?inject"},
  {...scope,quotationId:""},
  {...scope,customerId:"B".repeat(101)}
 ])await assert.rejects(()=>f.reader.loadApprovedBusinessQuotation(bad),/source_unverified/);
 assert.equal(f.state.checks.length,0);
});
test("missing audit or revoked quote cannot be accepted from a zero-row guarded SELECT",async()=>{
 const f=await setup({row:null});
 assert.equal(await f.reader.loadApprovedBusinessQuotation(scope),null);
 assert.equal(f.state.authorityChecks,0);
});
test("bound D1 identity and real business approval must be independently attested",async()=>{
 const db=await setup({bound:false});
 await assert.rejects(()=>db.reader.loadApprovedBusinessQuotation(scope),/source_unverified/);
 assert.equal(db.state.checks.length,0);
 const source=await setup({approved:false});
 await assert.rejects(()=>source.reader.loadApprovedBusinessQuotation(scope),/source_unverified/);
 assert.equal(source.state.authorityChecks,1);
});
test("tampered source records, wrong currency or byte hashes must deny",async()=>{
 const source=await validRow();
 for(const bad of [
  {tenant_id:"tenantB"},{customer_id:"customerB"},{quotation_id:"quoteB"},
  {quotation_reference:"invalid ref"},{approval_evidence_id:""},
  {approved_by_actor_user_id:"/owner"},{total_minor:-1},
  {acceptance_version:0},{currency:"USD"},{approved_at_ms:0},
  {quotation_sha256:"a".repeat(64)},{terms_sha256:"b".repeat(64)},
  {immutable_quotation_bytes:te.encode("different")},
  {immutable_terms_bytes:[0,1,2,3]},
  {immutable_terms_bytes:[]},{immutable_quotation_bytes:"malformed"}
 ]){
  const f=await setup({row:{...source,...bad}});
  await assert.rejects(()=>f.reader.loadApprovedBusinessQuotation(scope),
   /source_unverified/,JSON.stringify(bad));
 }
});
test("D1 outage fails closed; missing row never substitutes a browser quotation draft",async()=>{
 const f=await setup({queryError:true});
 await assert.rejects(()=>f.reader.loadApprovedBusinessQuotation(scope),/source_unverified/);
 const m=await setup({row:null});
 assert.equal(await m.reader.loadApprovedBusinessQuotation(scope),null);
});
test("read adapter composes with owner-only publication and frozen quote store without granting login",async()=>{
 const f=await setup();
 let frozen=0;
 const publisher=createPublication({
  enabled:true,environment:"essentials-private-staging",
  cryptoSubtle:webcrypto.subtle,
  loadActiveBusinessCustomer:async()=>({
   tenantId:"tenantA",customerId:"customerA",state:"active",
   revoked:false,deleted:false,authoritativeSource:true
  }),
  loadApprovedBusinessQuotation:f.reader.loadApprovedBusinessQuotation,
  authorizeBusinessPublication:async()=>true,
  verifyCurrentApprovalAtFreeze:async()=>true,
  frozenTermsStore:{async freezeQuotationWithTerms({source}){
   frozen++;
   assert.equal(source.tenantId,"tenantA");
   assert.deepEqual(source.immutableTermsBytes,terms);
   return {state:"frozen-with-terms",tenantId:source.tenantId,
    customerId:source.customerId,quotationId:source.quotationId,
    quotationSha256:await sha(source.immutableQuotationBytes),
    termsSha256:await sha(source.immutableTermsBytes),
    acceptanceVersion:source.acceptanceVersion,totalMinor:source.totalMinor};
  }}
 });
 const principal={
  authenticated:true,sessionVerified:true,csrfVerified:true,
  role:"owner",tenantId:"tenantA",userId:"ownerA",
  permissions:["quotation:issue:approved"]
 };
 const result=await publisher.publishApprovedQuotation({...scope,principal});
 assert.equal(result.state,"frozen-with-terms");
 assert.equal(result.customerLoginEnabled,false);
 assert.equal(result.invitationSent,false);
 assert.equal(frozen,1);
});
