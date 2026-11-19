import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateConsolidatedCustomerConsent as create,
 ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_REVIEW_SQL as CONSUME,
 ESSENTIALS_PRIVATE_INSERT_CUSTOMER_ACCEPTANCE_SQL as INSERT,
 ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_ACCEPTANCE_SQL as ASSERT,
 ESSENTIALS_PRIVATE_READ_CUSTOMER_ACCEPTANCE_SQL as READ
} from "../server/essentials-private-consolidated-customer-consent.mjs";
const hmacKey=await webcrypto.subtle.generateKey(
 {name:"HMAC",hash:"SHA-256",length:256},false,["sign","verify"]);
const at=Date.parse("2026-11-19T21:20:00Z");
const ctx={
 role:"customer",tenantId:"tenantA",quotationId:"quoteA",
 customerId:"customerA",customerIdentityLinkId:"linkA",
 sessionKeyHash:"a".repeat(64),presentationId:"presentationA",
 confirmedQuoteSha256:"b".repeat(64),confirmedTermsSha256:"c".repeat(64),
 confirmedTotalMinor:10000,confirmedAcceptanceVersion:2,
 decision:"accept",explicitlyAccepted:true
};
const proof={
 verified:true,tenantId:"tenantA",customerId:"customerA",
 quotationId:"quoteA",customerIdentityLinkId:"linkA",
 issuer:"https://identity.private.example.test",consentSubjectId:"consentA",
 identitySubjectHmacSha256:"d".repeat(64),
 authenticationProofSha256:"e".repeat(64),
 authenticatedAtMs:at-1000
};
const request={method:"POST"};
function harness({
 context=ctx,identity=proof,allowed=true,allowPost=true,failBatch=false,
 zeroRow=false,clock=at
}={}){
 const state={batches:[],calls:[],row:null,accepted:false,failBatch,zeroRow};
 const db={
  prepare(sql){return {bind(...args){
   state.calls.push({sql,args});
   return {
    sql,args,
    async first(){
     if(sql!==READ)throw Error("unexpected SQL");
     if(args[0]!=="tenantA"||args[1]!=="quoteA")return null;
     return state.row?{...state.row}:null;
    }
   };
  }}},
  async batch(statements){
   state.batches.push(statements);
   if(failBatch||zeroRow||state.accepted)throw Error("SQL ABORT");
   if(statements.length!==3||
    statements[0].sql!==CONSUME||
    statements[1].sql!==INSERT||
    statements[2].sql!==ASSERT)throw Error("unsafe batch");
   const consume=statements[0].args,insert=statements[1].args,
     audit=statements[2].args;
   if(consume[1]!=="presentationA"||consume[2]!==ctx.sessionKeyHash||
      consume[3]!=="tenantA"||consume[4]!=="customerA"||
      consume[5]!=="quoteA"||consume[6]!==ctx.confirmedQuoteSha256||
      consume[7]!==ctx.confirmedTermsSha256||
      consume[8]!==2||consume[9]!==10000||
      insert[5]!==consume[1]||insert[6]!==consume[2]||
      insert[7]!==consume[3]||insert[8]!==consume[4]||
      insert[9]!==consume[5]||insert[10]!=="linkA"||
      insert[11]!==consume[6]||insert[12]!==consume[7]||
      audit[0]!=="tenantA"||audit[1]!=="quoteA"||
      audit[2]!=="presentationA"||audit[3]!==ctx.sessionKeyHash||
      audit[4]!==insert[1])throw Error("SQL bind mismatch");
   state.accepted=true;
   state.row={
    tenant_id:"tenantA",quotation_id:"quoteA",customer_id:"customerA",
    presentation_id:"presentationA",session_key_sha256:ctx.sessionKeyHash,
    customer_identity_link_id:"linkA",
    identity_issuer:proof.issuer,
    consent_subject_id:"consentA",identity_subject_hmac_sha256:proof.identitySubjectHmacSha256,
    quotation_sha256:ctx.confirmedQuoteSha256,
    terms_sha256:ctx.confirmedTermsSha256,acceptance_version:2,
    total_minor:10000,authentication_proof_sha256:proof.authenticationProofSha256,
    acceptance_sha256:insert[1],immutable_acceptance_bytes:insert[2],
    server_hmac_sha256:insert[3],accepted_at_ms:at,state:"accepted"
   };
   return statements.map(()=>({success:true,meta:{changes:1}}));
  }
 };
 const calls={boundary:[],identity:[],authorized:[]};
 const service=create({
  enabled:true,environment:"essentials-private-staging",db,hmacKey,
  cryptoSubtle:webcrypto.subtle,now:()=>clock,
  validateExplicitCustomerAcceptance:async ({request,quotationId})=>{
   calls.boundary.push({request,quotationId});
   if(!allowPost)throw Error("invalid csrf or origin");
   return context;
  },
  verifyCurrentCustomerIdentityProof:async input=>{
   calls.identity.push(input);return identity;
  },
  authorizeCustomerConsentCommit:async data=>{
   calls.authorized.push(data);return allowed;
  }
 });
 return {service,calls,state};
}
const deny=fn=>assert.rejects(fn(),/private_customer_final_consent_unverified/);
test("composite customer commit is private-only and requires real nonextractable HMAC key",()=>{
 assert.throws(()=>create(),/private_customer_final_consent_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_customer_final_consent_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),
  /private_customer_final_consent_unconfigured/);
});
test("one independently authorized outside-customer acceptance consumes review and commits signed evidence atomically",async()=>{
 const h=harness();
 const result=await h.service.commitExplicitCustomerAcceptance({
  request,quotationId:"quoteA"
 });
 assert.deepEqual(result,{
  state:"recorded",tenantId:"tenantA",quotationId:"quoteA",
  customerId:"customerA",acceptedAtMs:at,
  acceptanceSha256:result.acceptanceSha256,
  serverHmacSha256:result.serverHmacSha256
 });
 assert.match(result.acceptanceSha256,/^[0-9a-f]{64}$/);
 assert.match(result.serverHmacSha256,/^[0-9a-f]{64}$/);
 assert.equal(h.calls.boundary.length,1);
 assert.equal(h.calls.identity.length,1);
 assert.equal(h.calls.authorized.length,1);
 assert.deepEqual(h.state.batches[0].map(x=>x.sql),[CONSUME,INSERT,ASSERT]);
 const data=Uint8Array.from(h.state.row.immutable_acceptance_bytes);
 const json=JSON.parse(new TextDecoder().decode(data));
 assert.equal(json.role,"customer");
 assert.equal(json.explicitlyAccepted,true);
 assert.equal(json.termsSha256,ctx.confirmedTermsSha256);
 assert.equal(json.customerIdentityLinkId,"linkA");
 assert.equal(json.authenticationProofSha256,proof.authenticationProofSha256);
 assert.equal("actorUserId" in json,false);
 assert.equal("idToken" in json,false);
 assert.equal(JSON.stringify(h.state.batches).includes("eyJ"),false);
 const read=await h.service.verifyRecordedCustomerAcceptance({
  tenantId:"tenantA",quotationId:"quoteA"
 });
 assert.equal(read.acceptanceSha256,result.acceptanceSha256);
 assert.equal(read.serverHmacSha256,result.serverHmacSha256);
 assert.equal(read.state,"accepted");
 await deny(()=>h.service.commitExplicitCustomerAcceptance({
  request,quotationId:"quoteA"
 }));
 assert.equal(h.state.batches.length,2);
});
test("no callback-derived customer intent means NO database batch",async()=>{
 const cases=[
  [{context:{...ctx,role:"employee"}},"role"],
  [{context:{...ctx,decision:"reject"}},"decision"],
  [{context:{...ctx,explicitlyAccepted:false}},"checkbox"],
  [{context:{...ctx,quotationId:"quoteB"}},"wrong quote"],
  [{context:{...ctx,sessionKeyHash:"bad"}},"bad session"],
  [{identity:{...proof,verified:false}},"identity not verified"],
  [{identity:{...proof,customerId:"other"}},"wrong customer identity"],
  [{identity:{...proof,authenticatedAtMs:at-900000}},"stale identity"],
  [{identity:{...proof,identitySubjectHmacSha256:"bad"}},"bad subject"],
  [{allowed:false},"unauthorized final commit"],
  [{allowPost:false},"blocked origin/csrf"]
 ];
 for(const [config,reason] of cases){
  const h=harness(config);
  await deny(()=>h.service.commitExplicitCustomerAcceptance({
   request,quotationId:"quoteA"
  }));
  assert.equal(h.state.batches.length,0,reason);
 }
});
test("missing source data, zero-row or failed transactional statement cannot claim acceptance",async()=>{
 for(const config of [{failBatch:true},{zeroRow:true}]){
  const h=harness(config);
  await deny(()=>h.service.commitExplicitCustomerAcceptance({
   request,quotationId:"quoteA"
  }));
  assert.equal(h.state.row,null);
  assert.equal(h.state.accepted,false);
 }
});
test("mutation of signed immutable evidence or stored HMAC is denied",async()=>{
 for(const field of ["immutable_acceptance_bytes","server_hmac_sha256","customer_id","terms_sha256"]){
  const h=harness();
  await h.service.commitExplicitCustomerAcceptance({request,quotationId:"quoteA"});
  if(field==="immutable_acceptance_bytes"){
   h.state.row[field][0]^=1;
  }else if(field==="server_hmac_sha256"){
   h.state.row[field]="f".repeat(64);
  }else if(field==="customer_id"){
   h.state.row[field]="other";
  }else h.state.row[field]="f".repeat(64);
  await deny(()=>h.service.verifyRecordedCustomerAcceptance({
   tenantId:"tenantA",quotationId:"quoteA"
  }));
 }
});
