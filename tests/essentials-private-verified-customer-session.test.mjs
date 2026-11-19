import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateVerifiedCustomerSession as create,
 ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_INVITE_SQL as INVITE,
 ESSENTIALS_PRIVATE_CREATE_CUSTOMER_SESSION_SQL as SESSION,
 ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_SESSION_SQL as ASSERT,
 ESSENTIALS_PRIVATE_READ_CUSTOMER_SESSION_SQL as READ,
 ESSENTIALS_PRIVATE_REVOKE_CUSTOMER_SESSION_SQL as REVOKE
} from "../server/essentials-private-verified-customer-session.mjs";
const subtle=webcrypto.subtle,te=new TextEncoder();
const rsa=await subtle.generateKey({
 name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
 publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"
},false,["sign","verify"]);
const nowAt=Date.parse("2026-11-19T20:15:00Z");
const ISSUER="https://identity.private.example.test",AUDIENCE="customer.private.client";
const NONCE="N".repeat(43),SESSION_HASH="a".repeat(64);
const invite={state:"pending",invitationId:"inviteA",tenantId:"tenantA",
 customerId:"customerA",quotationId:"quoteA",nonce:NONCE,
 issuedAtMs:nowAt-1000,expiresAtMs:nowAt+180000};
const claims={
 iss:ISSUER,aud:AUDIENCE,sub:"customer.subject.1",nonce:NONCE,
 iat:Math.floor(nowAt/1000)-1,auth_time:Math.floor(nowAt/1000)-1,
 exp:Math.floor(nowAt/1000)+500
};
const link={linked:true,customerIdentityLinkId:"linkA",
 consentSubjectId:"consentA",identitySubjectHmacSha256:"b".repeat(64)};
const b64=x=>Buffer.from(typeof x==="string"?x:JSON.stringify(x)).toString("base64url");
async function idToken(change={},headerChange={}){
 const h=b64({...{alg:"RS256",typ:"JWT",kid:"keyA"},...headerChange});
 const c=b64({...claims,...change});
 const sig=await subtle.sign("RSASSA-PKCS1-v1_5",rsa.privateKey,te.encode(h+"."+c));
 return h+"."+c+"."+Buffer.from(sig).toString("base64url");
}
const hex=async t=>[...new Uint8Array(await subtle.digest("SHA-256",
 te.encode(t)))].map(n=>n.toString(16).padStart(2,"0")).join("");
const rawCookie=out=>out.setCookie.split(";")[0].split("=")[1];
function fixture({allowCallback=true,allowOwnership=true,allowRevoke=true,
 currentInvitation=true,batchFailure=false,zeroRow=false}={}){
 const state={batch:[],grants:[],read:[],revoke:[],row:null,inviteConsumed:false,
  allowOwnership,allowCallback,currentInvitation};
 let rng=0;
 const db={prepare(sql){return {bind(...args){const stmt={sql,args};
  return {...stmt,
   async first(){
    if(sql===READ){
     state.read.push(args);
     const r=state.row;
     if(!r||r.state!=="active"||r.session_key_sha256!==args[0])return null;
     return {...r};
    }
    if(sql===REVOKE){
     state.revoke.push(args);const r=state.row;
     if(!r||r.state!=="active"||r.session_key_sha256!==args[1]||
      r.tenant_id!==args[2]||r.customer_id!==args[3]||
      r.quotation_id!==args[4])return null;
     r.state="revoked";return {session_key_sha256:r.session_key_sha256};
    }
    throw Error("wrong query");
   }
  };
 }}},
 async batch(stmts){
  state.batch.push(stmts);
  if(batchFailure||zeroRow||state.inviteConsumed)throw Error("SQL ABORT");
  if(stmts.length!==3||stmts[0].sql!==INVITE||stmts[1].sql!==SESSION||
     stmts[2].sql!==ASSERT)throw Error("wrong SQL batch");
  const n=stmts[1].args;
  state.inviteConsumed=true;
  state.row={
   session_key_sha256:n[0],csrf_sha256:n[1],invitation_id:n[2],
   tenant_id:n[3],customer_id:n[4],quotation_id:n[5],
   customer_identity_link_id:"linkA",consent_subject_id:"consentA",
   identity_subject_hmac_sha256:n[6],expires_at_ms:n[9],state:"active"
  };
  return stmts.map(()=>({success:true,meta:{changes:1}}));
 }
 };
 const service=create({
  enabled:true,environment:"essentials-private-staging",db,issuer:ISSUER,
  audience:AUDIENCE,keyId:"keyA",publicKey:rsa.publicKey,cryptoSubtle:subtle,
  now:()=>nowAt,randomBytes:size=>new Uint8Array(size).fill(++rng),
  loadTrustedCustomerInvitation:async ({invitationId})=>
   state.currentInvitation&&invitationId==="inviteA"?{...invite}:null,
  verifyTrustedCustomerCallback:async c=>{
   state.grants.push(c);
   return state.allowCallback&&c.invitationId==="inviteA";
  },
  resolveCustomerAccountLink:async ({issuer,subject,tenantId,customerId,quotationId})=>{
   if(issuer!==ISSUER||subject!==claims.sub||tenantId!=="tenantA"||
      customerId!=="customerA"||quotationId!=="quoteA")throw Error("wrong subject");
   return {...link};
  },
  verifyCurrentCustomerOwnership:async ()=>state.allowOwnership,
  authorizeCustomerSessionRevocation:async ()=>allowRevoke
 });
 return {service,state};
}
const deny=async fn=>assert.rejects(fn(),/private_customer_session_unverified/);
test("off by default, private-only and pinned provider key required",()=>{
 assert.throws(()=>create(),/private_customer_session_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_customer_session_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),
  /private_customer_session_unconfigured/);
});
test("signed freshly reauthenticated OIDC customer issues DISTINCT customer cookie and atomic invite",async()=>{
 const h=fixture();
 const output=await h.service.issueVerifiedCustomerSession({
  invitationId:"inviteA",idToken:await idToken()
 });
 assert.equal(output.role,"customer");
 assert.equal(output.expiresAtMs,invite.expiresAtMs);
 assert.match(output.setCookie,/^__Host-thebe-customer=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=180$/);
 assert.match(output.csrfToken,/^[A-Za-z0-9_-]{43}$/);
 assert.notEqual(rawCookie(output),output.csrfToken);
 assert.deepEqual(h.state.batch[0].map(x=>x.sql),[INVITE,SESSION,ASSERT]);
 const [consume,insert,audit]=h.state.batch[0];
 assert.deepEqual(consume.args.slice(1,5),["inviteA","tenantA","customerA","quoteA"]);
 assert.deepEqual(insert.args.slice(0,6),[
  await hex(rawCookie(output)),await hex(output.csrfToken),
  "inviteA","tenantA","customerA","quoteA"
 ]);
 assert.deepEqual(audit.args.slice(0,5),[
  "inviteA",await hex(rawCookie(output)),"tenantA","customerA","quoteA"
 ]);
 assert.equal(JSON.stringify(h.state.batch).includes(claims.sub),false);
 assert.equal(JSON.stringify(h.state.batch).includes(NONCE),false);
 assert.equal(JSON.stringify(h.state.batch).includes(rawCookie(output)),false);
 assert.equal(JSON.stringify(h.state.batch).includes(output.csrfToken),false);
 const current=await h.service.loadActiveCustomerSession({
  sessionKeyHash:await hex(rawCookie(output))
 });
 assert.deepEqual(current,{
  state:"active",role:"customer",tenantId:"tenantA",
  customerId:"customerA",quotationId:"quoteA",invitationId:"inviteA",
  customerIdentityLinkId:"linkA",csrfSha256:await hex(output.csrfToken),
  expiresAtMs:invite.expiresAtMs
 });
 await deny(()=>h.service.issueVerifiedCustomerSession({
  invitationId:"inviteA",idToken:output.setCookie
 }));
});
test("wrong nonce, audience, issuer, signature, auth_time and JWT algorithm are denied",async()=>{
 const invalid=[
  [await idToken({nonce:"X".repeat(43)})],
  [await idToken({aud:"other.client"})],
  [await idToken({iss:"https://fake.example.test"})],
  [await idToken({auth_time:Math.floor(nowAt/1000)-1000})],
  [await idToken({exp:Math.floor(nowAt/1000)-1})],
  [await idToken({sub:"different.subject"})],
  [await idToken({}, {alg:"none"})],
  [(await idToken()).slice(0,-2)+"AA"]
 ];
 for(const [token] of invalid){
  const h=fixture();
  await deny(()=>h.service.issueVerifiedCustomerSession({
   invitationId:"inviteA",idToken:token
  }));
  assert.equal(h.state.batch.length,0);
 }
});
test("unverified browser callback, missing invitation and withdrawn ownership fail before session",async()=>{
 for(const opts of [{allowCallback:false},{currentInvitation:false},
   {allowOwnership:false}]){
  const h=fixture(opts);
  await deny(()=>h.service.issueVerifiedCustomerSession({
   invitationId:"inviteA",idToken:await idToken()
  }));
  assert.equal(h.state.batch.length,0);
 }
});
test("SQL rollback and replay fail closed, never issue half-baked session",async()=>{
 for(const opts of [{batchFailure:true},{zeroRow:true}]){
  const h=fixture(opts);
  await deny(()=>h.service.issueVerifiedCustomerSession({
   invitationId:"inviteA",idToken:await idToken()
  }));
  assert.equal(h.state.row,null);
 }
 const h=fixture();
 const token=await idToken();
 await h.service.issueVerifiedCustomerSession({invitationId:"inviteA",idToken:token});
 await deny(()=>h.service.issueVerifiedCustomerSession({invitationId:"inviteA",idToken:token}));
 assert.equal(h.state.batch.length,2);
});
test("current independent ownership loss or account revocation removes customer access",async()=>{
 const h=fixture();
 const issued=await h.service.issueVerifiedCustomerSession({
  invitationId:"inviteA",idToken:await idToken()
 });
 const sessionKeyHash=await hex(rawCookie(issued));
 h.state.allowOwnership=false;
 assert.equal(await h.service.loadActiveCustomerSession({sessionKeyHash}),null);
 h.state.allowOwnership=true;
 assert.equal(await h.service.revokeCustomerSession({
  sessionKeyHash,tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA"
 }),true);
 assert.equal(await h.service.loadActiveCustomerSession({sessionKeyHash}),null);
 assert.equal(await h.service.revokeCustomerSession({
  sessionKeyHash,tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA"
 }),false);
});
test("malformed, cross-customer, unauthorized session revocation denies",async()=>{
 const h=fixture({allowRevoke:false});
 const issued=await h.service.issueVerifiedCustomerSession({
  invitationId:"inviteA",idToken:await idToken()
 });
 const sessionKeyHash=await hex(rawCookie(issued));
 await deny(()=>h.service.revokeCustomerSession({
  sessionKeyHash,tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA"
 }));
 assert.equal(h.state.row.state,"active");
 await deny(()=>h.service.revokeCustomerSession({
  sessionKeyHash:"bad",tenantId:"tenantA",
  customerId:"customerA",quotationId:"quoteA"
 }));
});
