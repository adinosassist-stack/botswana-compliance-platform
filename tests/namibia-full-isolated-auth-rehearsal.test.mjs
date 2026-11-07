import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import test from "node:test";
import {handleNamibiaInternalCandidate} from "../cloudflare/src/namibia-internal-api-candidate.js";
const path="../proposals/namibia/";
const sessionSchema=readFileSync(new URL(path+"003_disposable_sessions_candidate.sql",import.meta.url),"utf8");
const complianceSchema=readFileSync(new URL(path+"001_compliance_candidate.sql",import.meta.url),"utf8");
const base="https://na-rehearsal.example.test";
const secret="local-only-session-hmac-key";
const token="local-synthetic-session-cookie";
const csrf="synthetic-csrf-token";
const expectedIds={
 NAMIBIA_SESSION_DB_ID:"cb833f28-8ea6-4234-b183-c12c018aac15",
 NAMIBIA_CANDIDATE_DB_ID:"c8ce1dd7-6973-45e8-be7f-1b4f2b672312",
 BOTSWANA_PRODUCTION_DB_ID:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"
};
async function hmacHex(value){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
   {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return [...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))]
   .map(x=>x.toString(16).padStart(2,"0")).join("");
}
function adapter(sqlite){
 return {
  sqlite,
  prepare(sql){return {bind(...args){
   const stmt=sqlite.prepare(sql);
   const values=args.map(x=>x===undefined?null:x);
   return {
    async first(){return stmt.get(...values)||null},
    async all(){return {results:stmt.all(...values)}},
    run(){return stmt.run(...values)}
   };
  }}},
  async batch(statements){
   sqlite.exec("BEGIN IMMEDIATE");
   try{
    const results=statements.map(s=>s.run());
    sqlite.exec("COMMIT");return results;
   }catch(error){sqlite.exec("ROLLBACK");throw error}
  }
 };
}
async function fixture(){
 const sessions=new DatabaseSync(":memory:"),compliance=new DatabaseSync(":memory:");
 sessions.exec("PRAGMA foreign_keys=ON");compliance.exec("PRAGMA foreign_keys=ON");
 sessions.exec(sessionSchema);compliance.exec(complianceSchema);
 const hash=await hmacHex(token);
 const user="synthetic-owner-1",tenant="synthetic-tenant-NA";
 sessions.prepare("INSERT INTO users(id,email,session_generation) VALUES(?,?,?)")
   .run(user,"owner@example.test",1);
 sessions.prepare("INSERT INTO memberships(user_id,tenant_id,role,status) VALUES(?,?,?,?)")
   .run(user,tenant,"owner","active");
 sessions.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES(?,?,?,?,?,?)")
   .run(hash,user,tenant,csrf,1,"2099-01-01 00:00:00");
 const env={
  DB:adapter(sessions),NA_CANDIDATE_DB:adapter(compliance),
  SESSION_SECRET:secret,PUBLIC_ORIGIN:base,
  NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED:"1",
  NAMIBIA_INTERNAL_API_MODE:"isolated_candidate",
  NAMIBIA_STAGE_KIND:"disposable_internal_test",
  NAMIBIA_BINDINGS_AUDITED:"1",
  NA_CANDIDATE_TENANT_ALLOWLIST:tenant,
  ...expectedIds
 };
 async function request(route,method="GET",body,opts={}){
  const headers={cookie:"__Host-bw_session="+(opts.cookie??token),origin:base,
    "x-csrf-token":opts.csrf??csrf};
  if(body!==undefined)headers["content-type"]="application/json";
  const response=await handleNamibiaInternalCandidate(new Request(base+route,
   {method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  return {status:response.status,body:await response.json()};
 }
 return {sessions,compliance,env,request,close(){sessions.close();compliance.close()}};
}
const entity={entityRef:"NA-ISOLATED-ENTITY",entityType:"company",financialYearEnd:"2026-12-31"};
test("actual independent SQLite session and compliance schemas authenticate, audit and reject stale sessions",async()=>{
 const fx=await fixture();
 try{
  assert.notEqual(fx.env.DB.sqlite,fx.env.NA_CANDIDATE_DB.sqlite);
  assert.equal((await fx.request("/internal/namibia/entities","POST",entity)).status,201);
  assert.equal((await fx.request("/internal/namibia/evidence","POST",{
   entityRef:entity.entityRef,evidenceType:"entity_registration",label:"Synthetic evidence"
  })).status,201);
  assert.equal((await fx.request("/internal/namibia/evidence?entityRef=NA-ISOLATED-ENTITY")).body.length,1);
  assert.equal(fx.compliance.prepare("SELECT COUNT(*) n FROM na_compliance_audit_events").get().n,2);
  assert.equal(fx.sessions.prepare("SELECT COUNT(*) n FROM sessions").get().n,1);
  assert.equal((await fx.request("/internal/namibia/entities","POST",{...entity,entityRef:"NOPE"},
   {cookie:"stolen-forged"})).status,401);
  assert.equal((await fx.request("/internal/namibia/entities","POST",{...entity,entityRef:"NOPE"},
   {csrf:"wrong-token"})).status,403);
  fx.sessions.prepare("UPDATE memberships SET status='suspended' WHERE tenant_id=?").run("synthetic-tenant-NA");
  assert.equal((await fx.request("/internal/namibia/evidence?entityRef=NA-ISOLATED-ENTITY")).status,401);
  fx.sessions.prepare("UPDATE memberships SET status='active' WHERE tenant_id=?").run("synthetic-tenant-NA");
  fx.sessions.prepare("UPDATE users SET session_generation=2 WHERE id=?").run("synthetic-owner-1");
  assert.equal((await fx.request("/internal/namibia/evidence?entityRef=NA-ISOLATED-ENTITY")).status,401);
  assert.equal(fx.compliance.prepare("SELECT COUNT(*) n FROM na_compliance_entities").get().n,1);
 }finally{fx.close()}
});
test("dedicated auth schema refuses real customers and API binding collision fails before DB access",async()=>{
 const fx=await fixture();
 try{
  assert.throws(()=>fx.sessions.prepare("INSERT INTO users(id,email) VALUES(?,?)")
    .run("customer-user","person@example.test"),/CHECK/);
  assert.throws(()=>fx.sessions.prepare("INSERT INTO users(id,email) VALUES(?,?)")
    .run("synthetic-other","person@external.test"),/CHECK/);
  fx.env.NAMIBIA_CANDIDATE_DB_ID=fx.env.BOTSWANA_PRODUCTION_DB_ID;
  assert.equal((await fx.request("/internal/namibia/evidence?entityRef=NA-ISOLATED-ENTITY")).status,404);
 }finally{fx.close()}
});
