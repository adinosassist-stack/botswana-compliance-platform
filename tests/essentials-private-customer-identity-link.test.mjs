import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateCustomerIdentityLinkResolver,
 ESSENTIALS_PRIVATE_CUSTOMER_IDENTITY_LINK_SQL
} from "../server/essentials-private-customer-identity-link.mjs";

const subtle=webcrypto.subtle;
const now=Date.parse("2026-11-19T13:30:00Z");
const issuer="https://identity.example.test";
const key=await subtle.generateKey({name:"HMAC",hash:"SHA-256"},false,["sign"]);
const sha=async text=>Array.from(new Uint8Array(await subtle.digest("SHA-256",
 new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,"0")).join("");
const sign=async subject=>Array.from(new Uint8Array(await subtle.sign("HMAC",key,
 new TextEncoder().encode(JSON.stringify([issuer,subject])))),
 x=>x.toString(16).padStart(2,"0")).join("");
const p={issuer,subject:"customer-subject-A",tenantId:"tenantA",
 customerId:"customerA",quotationId:"quoteA"};
const row={link_id:"linkA",tenant_id:"tenantA",customer_id:"customerA",
 consent_subject_id:"customerAuthA",provisioned_by_actor_user_id:"actorA",
 proof_reference_sha256:await sha("approved-oob-proof"),expires_at_ms:now+100000,
 state:"active"};
function setup({dbRow=row,dbFails=false,validOwnership=true,ownFails=false}={}){
 const calls={sql:[],ownership:[]};
 const db={prepare(sql){
  return {bind(...args){
   calls.sql.push({sql,args});
   return {async first(){if(dbFails)throw Error("db-down");return dbRow}};
  }};
 }};
 const resolver=createEssentialsPrivateCustomerIdentityLinkResolver({
  enabled:true,environment:"essentials-private-staging",
  db,issuer,subjectTagKey:key,cryptoSubtle:subtle,now:()=>now,
  verifyCurrentCustomerOwnership:async args=>{
   calls.ownership.push(args);
   if(ownFails)throw Error("downstream mapping failed");
   return validOwnership;
  }
 });
 return {resolver,calls};
}
test("disabled by default; requires isolated staging HMAC secret and host ownership",()=>{
 assert.throws(()=>createEssentialsPrivateCustomerIdentityLinkResolver(),
  /private_customer_identity_link_disabled/);
 assert.throws(()=>createEssentialsPrivateCustomerIdentityLinkResolver({
  enabled:true,environment:"production"
 }),/private_customer_identity_link_disabled/);
 assert.throws(()=>createEssentialsPrivateCustomerIdentityLinkResolver({
  enabled:true,environment:"essentials-private-staging",issuer
 }),/private_customer_identity_link_unconfigured/);
});
test("verified signed subject tag and independently current owner yield opaque identity",async()=>{
 const {resolver,calls}=setup();
 const result=await resolver.resolveCustomerAccountLink(p);
 assert.deepEqual(result,{linked:true,consentSubjectId:"customerAuthA"});
 assert.deepEqual(calls.sql,[{sql:ESSENTIALS_PRIVATE_CUSTOMER_IDENTITY_LINK_SQL,
  args:[issuer,await sign(p.subject),"tenantA","customerA",now]}]);
 assert.equal(JSON.stringify(calls.sql).includes(p.subject),false);
 assert.equal(calls.ownership.length,1);
 assert.equal(calls.ownership[0].tenantId,"tenantA");
 assert.equal(calls.ownership[0].customerId,"customerA");
 assert.equal(calls.ownership[0].proofReferenceSha256,row.proof_reference_sha256);
});
test("issuer, tenant and customer mismatches and untrusted subjects deny",async()=>{
 for(const override of [{issuer:"https://other.example.test"},
  {subject:""}, {subject:"../../danger"}, {tenantId:"bad/id"},
  {customerId:"bad/id"}, {quotationId:"bad/id"}]){
  const h=setup();
  await assert.rejects(h.resolver.resolveCustomerAccountLink({...p,...override}),
   /private_customer_identity_link_unverified/);
  assert.equal(h.calls.sql.length,0);
 }
});
test("revoked, expired, cross-tenant, wrong customer and malformed DB records deny",async()=>{
 for(const patch of [{state:"revoked"},{expires_at_ms:now},
  {tenant_id:"tenantB"},{customer_id:"customerB"},
  {consent_subject_id:"bad/id"},{proof_reference_sha256:"bad"},
  {link_id:"../other"},{provisioned_by_actor_user_id:"invalid user"}]){
  const h=setup({dbRow:{...row,...patch}});
  await assert.rejects(h.resolver.resolveCustomerAccountLink(p),
   /private_customer_identity_link_unverified/);
  assert.equal(h.calls.ownership.length,0);
 }
});
test("stale authoritative ownership, D1 outages and revocation callback errors deny",async()=>{
 for(const options of [{dbRow:null},{dbFails:true},
  {validOwnership:false},{ownFails:true}]){
  const h=setup(options);
  await assert.rejects(h.resolver.resolveCustomerAccountLink(p),
   /private_customer_identity_link_unverified/);
 }
});
