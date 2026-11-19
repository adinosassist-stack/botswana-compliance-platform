import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateCustomerInviteOidcJourney as create,
 ESSENTIALS_PRIVATE_ISSUE_CUSTOMER_INVITE_SQL as ISSUE,
 ESSENTIALS_PRIVATE_SAVE_CUSTOMER_INVITE_LAUNCH_SQL as LAUNCH,
 ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_INVITE_ISSUE_SQL as ISSUE_AUDIT,
 ESSENTIALS_PRIVATE_READ_CUSTOMER_INVITE_LAUNCH_SQL as READ_LAUNCH,
 ESSENTIALS_PRIVATE_START_CUSTOMER_INVITE_SQL as START,
 ESSENTIALS_PRIVATE_SAVE_CUSTOMER_OIDC_ATTEMPT_SQL as SAVE_ATTEMPT,
 ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_OIDC_START_SQL as START_AUDIT,
 ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_OIDC_ATTEMPT_SQL as CONSUME
} from "../server/essentials-private-customer-invitation-oidc-journey.mjs";
const subtle=webcrypto.subtle,at=Date.parse("2026-11-19T21:55:00Z");
const origin="https://customer.private.test";
const issuer="https://idp.private.test";
const tokenEndpoint=issuer+"/token",authorizationEndpoint=issuer+"/authorize";
const redirectUri=origin+"/private/customer/oidc/callback";
const nonceEncryptionKey=await subtle.generateKey(
 {name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const verifierEncryptionKey=await subtle.generateKey(
 {name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const sha=async x=>[...new Uint8Array(await subtle.digest("SHA-256",
 new TextEncoder().encode(x)))].map(n=>n.toString(16).padStart(2,"0")).join("");
function harness({authority=true,owned=true,validQuote=true,
 failBatch=false}={}){
 let n=0;
 const state={invite:null,launch:null,attempt:null,batches:[],
  exchanges:[],sessions:[],readNonce:[],failBatch};
 const db={
  prepare(sql){return{bind(...args){return{
   sql,args,
   async first(){
    if(sql===READ_LAUNCH){
     const l=state.launch,i=state.invite;
     if(!l||!i||l.invitation_id!==args[0]||l.state!==args[1])return null;
     return {...l,tenant_id:i.tenant_id,customer_id:i.customer_id,
      quotation_id:i.quotation_id,nonce_sha256:i.nonce_sha256,
      invite_state:i.state};
    }
    if(sql===CONSUME){
     const a=state.attempt;
     if(!a||a.state!=="pending"||
      a.state_sha256!==args[1]||a.oauth_cookie_sha256!==args[2]||
      a.expires_at_ms<=args[4])return null;
     a.state="consumed";return {...a};
    }
    throw Error("bad query");
   }
  }}}},
  async batch(statements){
   state.batches.push(statements);
   if(state.failBatch)throw Error("SQL rollback");
   if(statements.length!==3)throw Error("batch shape");
   if(statements[0].sql===ISSUE){
    if(statements[1].sql!==LAUNCH||statements[2].sql!==ISSUE_AUDIT||
       state.invite)throw Error("bad issue batch");
    const i=statements[0].args,l=statements[1].args;
    state.invite={
     invitation_id:i[0],tenant_id:i[1],customer_id:i[2],
     quotation_id:i[3],nonce_sha256:i[4],
     issued_at_ms:i[5],expires_at_ms:i[6],state:"pending"
    };
    state.launch={
     invitation_id:l[0],customer_identity_link_id:l[1],
     ticket_sha256:l[2],nonce_iv:l[3],nonce_ciphertext:l[4],
     issued_at_ms:l[5],expires_at_ms:l[6],state:"issued"
    };
   }else if(statements[0].sql===START){
    if(statements[1].sql!==SAVE_ATTEMPT||
       statements[2].sql!==START_AUDIT||!state.launch||
       state.launch.state!=="issued")throw Error("bad start batch");
    const s=statements[0].args,a=statements[1].args;
    if(state.launch.invitation_id!==s[1]||
       state.launch.ticket_sha256!==s[2])throw Error("wrong proof");
    state.launch.state="started";
    state.attempt={
     attempt_id:a[0],invitation_id:a[7],state_sha256:a[1],
     oauth_cookie_sha256:a[2],verifier_iv:a[3],
     verifier_ciphertext:a[4],issued_at_ms:a[5],
     expires_at_ms:a[6],state:"pending"
    };
   }else throw Error("unknown SQL");
   return statements.map(()=>({success:true,meta:{changes:1}}));
  }
 };
 const quote={state:"accepted",tenantId:"tenantA",customerId:"customerA",
  quotationId:"quoteA",quotationSha256:"a".repeat(64),
  termsSha256:"b".repeat(64),acceptanceVersion:2,totalMinor:10000};
 const journey=create({
  enabled:true,environment:"essentials-private-staging",
  db,issuer,clientId:"thebe_customer_client",authorizationEndpoint,
  tokenEndpoint,redirectUri,expectedOrigin:origin,
  nonceEncryptionKey,verifierEncryptionKey,
  cryptoSubtle:subtle,now:()=>at,
  randomBytes:size=>new Uint8Array(size).fill(++n),
  authorizeCustomerInvitation:async ()=>authority,
  loadFrozenCustomerQuote:async()=>validQuote?quote:null,
  verifyCurrentCustomerOwnership:async()=>owned,
  authorizeTrustedInvitationNonceRead:async x=>{
   state.readNonce.push(x);return true;
  },
  exchangeAuthorizationCode:async x=>{
   state.exchanges.push(x);
   return {idToken:["e".repeat(24),"f".repeat(80),"g".repeat(150)].join(".")};
  },
  issueVerifiedCustomerSession:async x=>{
   state.sessions.push(x);
   return {role:"customer",
    setCookie:"__Host-thebe-customer="+"C".repeat(43)+
     "; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=150",
    csrfToken:"S".repeat(43),expiresAtMs:at+150000};
  }
 });
 const issue=()=>journey.issueInvitation({
  tenantId:"tenantA",customerId:"customerA",
  quotationId:"quoteA",customerIdentityLinkId:"linkA"
 });
 const start=(invitationId,ticket,headers={})=>journey.beginCustomerLogin({
  invitationId,
  request:new Request(origin+"/private/customer/invitations/"+invitationId+"/start",{
   method:"POST",headers:{
    "content-type":"application/json","origin":origin,
    "sec-fetch-site":"same-origin",...headers
   },body:JSON.stringify({ticket})
  })
 });
 return {journey,issue,start,state};
}
const reject=async f=>assert.rejects(f(),/private_customer_invite_oidc_unverified/);
test("customer invitation and login are disabled/unconfigured by default",()=>{
 assert.throws(()=>create(),/private_customer_invite_oidc_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_customer_invite_oidc_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),
  /private_customer_invite_oidc_unconfigured/);
});
test("one issue+start+callback produces distinct customer cookie, no raw secrets in SQL",async()=>{
 const h=harness();
 const issued=await h.issue();
 assert.match(issued.ticket,/^[A-Za-z0-9_-]{43}$/);
 assert.match(issued.invitationId,/^[A-Za-z0-9_-]{32}$/);
 assert.equal(h.state.batches.length,1);
 assert.deepEqual(h.state.batches[0].map(x=>x.sql),[ISSUE,LAUNCH,ISSUE_AUDIT]);
 assert.equal(h.state.launch.ticket_sha256,await sha(issued.ticket));
 assert.equal(JSON.stringify(h.state.batches).includes(issued.ticket),false);
 const start=await h.start(issued.invitationId,issued.ticket);
 assert.equal(h.state.batches.length,2);
 assert.deepEqual(h.state.batches[1].map(x=>x.sql),[START,SAVE_ATTEMPT,START_AUDIT]);
 assert.match(start.setCookie,/^__Host-thebe-customer-oauth=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=300$/);
 const u=new URL(start.authorizationUrl);
 assert.equal(u.origin,issuer);
 assert.equal(u.searchParams.get("code_challenge_method"),"S256");
 assert.equal(u.searchParams.get("prompt"),"login");
 assert.equal(u.searchParams.get("nonce").length,43);
 assert.equal(await sha(u.searchParams.get("nonce")),h.state.invite.nonce_sha256);
 const oauthCookie=start.setCookie.split(";")[0];
 const callbackUrl=redirectUri+"?code=synthetic_code_123&state="+
  u.searchParams.get("state")+"&iss="+encodeURIComponent(issuer);
 const result=await h.journey.completeCustomerLogin({
  request:new Request(callbackUrl,{headers:{cookie:oauthCookie}})
 });
 assert.equal(result.quotationId,"quoteA");
 assert.match(result.customerSetCookie,/^__Host-thebe-customer=/);
 assert.match(result.csrfSetCookie,/^__Host-thebe-customer-csrf=S{43}; Secure; SameSite=Strict; Path=\/; Max-Age=150$/);
 assert.equal(result.oauthClearCookie.includes("Max-Age=0"),true);
 assert.equal(h.state.exchanges[0].code,"synthetic_code_123");
 assert.equal(h.state.sessions[0].invitationId,issued.invitationId);
 assert.equal(h.state.sessions[0].idToken.split(".").length,3);
 assert.equal(h.state.attempt.state,"consumed");
 assert.equal(JSON.stringify(h.state.attempt).includes(h.state.exchanges[0].codeVerifier),false);
 await reject(()=>h.journey.completeCustomerLogin({
  request:new Request(callbackUrl,{headers:{cookie:oauthCookie}})
 }));
});
test("one time invitation: wrong ticket, origin, link ownership, reuse and malformed URL deny",async()=>{
 for(const config of [{authority:false},{owned:false},{validQuote:false}]){
  const h=harness(config);await reject(()=>h.issue());
  assert.equal(h.state.batches.length,0);
 }
 const h=harness();const a=await h.issue();
 await reject(()=>h.start(a.invitationId,"x".repeat(43)));
 assert.equal(h.state.batches.length,1);
 await reject(()=>h.start(a.invitationId,a.ticket,{"origin":"https://evil.test"}));
 const b=await h.start(a.invitationId,a.ticket);
 await reject(()=>h.start(a.invitationId,a.ticket));
 const url=new URL(b.authorizationUrl);
 const wrongCode=redirectUri+"?code=short&state="+
  url.searchParams.get("state")+"&iss="+encodeURIComponent(issuer);
 await reject(()=>h.journey.completeCustomerLogin({
  request:new Request(wrongCode,{
   headers:{cookie:b.setCookie.split(";")[0]}
  })
 }));
 assert.equal(h.state.attempt.state,"pending");
});
test("source callback requires exact cookie, issuer, original state and no injected query keys",async()=>{
 const h=harness();const i=await h.issue();const b=await h.start(i.invitationId,i.ticket);
 const state=new URL(b.authorizationUrl).searchParams.get("state");
 const good=redirectUri+"?code=long_secure_code&state="+state+
  "&iss="+encodeURIComponent(issuer);
 for(const [url,cookie] of [
  [good,"__Host-thebe-customer-oauth="+"Q".repeat(43)],
  [good.replace(state,"B".repeat(43)),b.setCookie.split(";")[0]],
  [good+"&customerId=customerB",b.setCookie.split(";")[0]],
  [good.replace(encodeURIComponent(issuer),encodeURIComponent("https://bad.test")),
   b.setCookie.split(";")[0]]
 ]){
  await reject(()=>h.journey.completeCustomerLogin({
   request:new Request(url,{headers:{cookie}})
  }));
 }
 assert.equal(h.state.attempt.state,"pending");
 const s=await h.journey.loadTrustedCustomerInvitation({invitationId:i.invitationId});
 assert.equal(s.customerId,"customerA");
 assert.equal(s.nonce.length,43);
});
test("tampered encrypted nonce, failed SQL transaction and missing customer authority fail closed",async()=>{
 const h=harness();const i=await h.issue();
 h.state.launch.nonce_ciphertext[0]^=1;
 await reject(()=>h.start(i.invitationId,i.ticket));
 assert.equal(h.state.batches.length,1);
 const o=harness({failBatch:true});await reject(()=>o.issue());
 assert.equal(o.state.invite,null);
});
