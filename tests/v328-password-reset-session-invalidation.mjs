import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../cloudflare/src/worker.js";

const origin="https://app.example";
const sessionSecret="review-password-reset-secret-20261011-abcdefghijklmnopqrstuvwxyz";
const rawToken="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-abcdefgh";
const newPassword="N!review-password-reset-2026-Strong";
const userId="user-recovery-1";

async function hmacHex(secretValue,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secretValue),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
const tokenHash=await hmacHex(sessionSecret,rawToken);

class Statement{
  constructor(db,sql,bindings=[]){this.db=db;this.sql=String(sql);this.bindings=bindings}
  bind(...bindings){return new Statement(this.db,this.sql,bindings)}
  async first(){return this.db.first(this.sql,this.bindings)}
  async all(){return {results:[]}}
  async run(){this.db.runs.push({sql:this.sql,bindings:this.bindings});return {success:true,meta:{changes:1}}}
}
class ResetDB{
  constructor(){this.runs=[];this.batchSql=[];this.used=false}
  prepare(sql){return new Statement(this,sql)}
  async batch(statements){
    for(const statement of statements){this.batchSql.push(statement.sql);this.runs.push({sql:statement.sql,bindings:statement.bindings})}
    return statements.map(()=>({success:true,meta:{changes:1}}));
  }
  first(sql,bindings){
    if(sql.includes("SELECT count FROM auth_rate_limits"))return {count:1};
    if(sql.includes("SELECT 1 ok FROM password_reset_tokens")){
      assert.equal(bindings[0],tokenHash,"reset lookup must use the HMAC digest of the supplied token");
      return this.used?null:{ok:1};
    }
    if(sql.includes("UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP")&&sql.includes("RETURNING user_id")){
      assert.equal(bindings[0],tokenHash,"reset claim must use the HMAC digest of the supplied token");
      if(this.used)return null;
      this.used=true;
      return {user_id:userId};
    }
    return null;
  }
}

const db=new ResetDB();
const env={DB:db,SESSION_SECRET:sessionSecret,PUBLIC_ORIGIN:origin,PUBLIC_APP_URL:origin,ASSETS:{fetch:async()=>new Response("asset")}};
const ctx={waitUntil(){}};
async function complete(token=rawToken,password=newPassword){
  const response=await worker.fetch(new Request(origin+"/api/auth/password-reset/complete",{
    method:"POST",
    headers:{origin,"content-type":"application/json"},
    body:JSON.stringify({token,password})
  }),env,ctx);
  return {status:response.status,data:await response.json()};
}

const first=await complete();
assert.equal(first.status,200,JSON.stringify(first.data));
assert.equal(first.data.ok,true);
assert.ok(db.batchSql.some(sql=>sql.includes("UPDATE users SET password_hash=?")&&sql.includes("session_generation=session_generation+1")),"password reset must advance the user's session generation");
assert.ok(db.batchSql.some(sql=>sql.includes("DELETE FROM sessions WHERE user_id=?")),"password reset must delete all active sessions for the user");
assert.ok(db.batchSql.some(sql=>sql.includes("UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL")),"password reset must invalidate sibling reset tokens");
const deleteSessionRun=db.runs.find(x=>x.sql.includes("DELETE FROM sessions WHERE user_id=?"));
assert.deepEqual(deleteSessionRun?.bindings,[userId],"session invalidation must target only the reset user");

const replay=await complete();
assert.equal(replay.status,400,"consumed reset token must not be reusable");
assert.equal(replay.data.error,"reset_token_invalid_or_expired");

const productionSmoke=fs.readFileSync("scripts/production-password-recovery-smoke.mjs","utf8");
const postdeploy=fs.readFileSync(".github/workflows/client-runtime-postdeploy.yml","utf8");
assert.match(productionSmoke,/\/api\/auth\/password-reset\/request/,"production smoke must request a real reset");
assert.match(productionSmoke,/waitForResetEmail\(requestStarted\)/,"production smoke must retrieve the delivered reset message");
assert.match(productionSmoke,/\/api\/auth\/password-reset\/complete/,"production smoke must consume the delivered token");
assert.match(productionSmoke,/oldLogin\.response\.status===401/,"production smoke must prove the old password no longer authenticates");
assert.match(productionSmoke,/newPassword/);
assert.match(productionSmoke,/login\.response\.status===200&&login\.json\?\.ok===true/,"production smoke must prove the new password authenticates");
assert.match(postdeploy,/node scripts\/production-password-recovery-smoke\.mjs/,"post-deploy workflow must execute the production password recovery smoke");

console.log("V328 password reset session invalidation: reset runtime + production smoke chain PASS");
