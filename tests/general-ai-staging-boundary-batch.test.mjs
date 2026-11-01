import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/src/general-ai-staging-entry.js";

const base="https://ai-staging.thebedesk.com/api/ai/general";
const secret="qualification-secret-that-is-not-used-in-cloudflare";
const raw="controlled-session-token";
const csrf="controlled-csrf-value";
const hex=bytes=>Buffer.from(bytes).toString("hex");
async function digest(value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)));
}
function fakeDb(expected,{active=true,generation=0,expires=true,tenant="isolated-tenant"}={}){
  return {prepare(sql){
    assert.match(sql,/JOIN memberships/);
    assert.match(sql,/m.status='active'/);
    assert.match(sql,/s.session_generation=u.session_generation/);
    assert.match(sql,/s.expires_at>CURRENT_TIMESTAMP/);
    return {bind(hash){return {async first(){return hash===expected&&active&&generation===0&&expires?
      {user_id:"isolated-user",tenant_id:tenant,csrf_token:csrf,role:"owner",email:"fixture@example.invalid"}:null}}}};
  }};
}
function req({cookie=raw,csrfHeader=csrf,origin="https://ai-staging.thebedesk.com",question="What is a photon?"}={}){
  const headers={"content-type":"application/json",origin,"x-csrf-token":csrfHeader};
  if(cookie)headers.cookie="__Host-bw_session="+cookie;
  return new Request(base,{method:"POST",headers,body:JSON.stringify({question})});
}
function env(db,limiter={limit:async()=>({success:true})}){
  return {APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"true",THEBE_GENERAL_AI_RESEARCH_ENABLED:"false",
    PUBLIC_ORIGIN:"https://ai-staging.thebedesk.com",SESSION_SECRET:secret,DB:db,GENERAL_AI_RATE_LIMITER:limiter};
}
test("no cookie is rejected before any model call",async()=>{
  const r=await worker.fetch(req({cookie:null}),env(fakeDb(await digest(raw))));
  assert.equal(r.status,401);
});
test("invalid cookie is rejected",async()=>{
  const r=await worker.fetch(req({cookie:"forged"}),env(fakeDb(await digest(raw))));
  assert.equal(r.status,401);
});
for(const [title,opts] of [["inactive membership",{active:false}],["revoked session generation",{generation:1}],["expired session",{expires:false}]]){
  test(title+" is rejected",async()=>{
    const r=await worker.fetch(req(),env(fakeDb(await digest(raw),opts)));
    assert.equal(r.status,401);
  });
}
test("authenticated session still requires exact CSRF",async()=>{
  const r=await worker.fetch(req({csrfHeader:"wrong"}),env(fakeDb(await digest(raw))));
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,"csrf_failed");
});
test("authenticated session still requires exact origin",async()=>{
  const r=await worker.fetch(req({origin:"https://attacker.example"}),env(fakeDb(await digest(raw))));
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,"origin_failed");
});
test("authenticated valid request fails closed without model credentials",async()=>{
  const r=await worker.fetch(req(),env(fakeDb(await digest(raw))));
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,"model_unavailable");
});
test("tenant/user-specific quota key and denied quota are enforced",async()=>{
  let key="";
  const limiter={limit:async arg=>{key=arg.key;return {success:false}}};
  const r=await worker.fetch(req(),env(fakeDb(await digest(raw),{tenant:"tenant-A"}),limiter));
  assert.equal(r.status,429);
  assert.equal(key,"tenant-A:isolated-user");
});
test("research requires independently enabled search",async()=>{
  const r=await worker.fetch(req({question:"Research the latest Botswana electricity news"}),env(fakeDb(await digest(raw))));
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,"research_sources_unavailable");
});
