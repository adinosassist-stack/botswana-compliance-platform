import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {randomUUID,createHmac} from "node:crypto";
import crypto from "node:crypto";
import express from "express";
import pg from "pg";

// Executes the exact session loader/auth functions from server.js over real
// loopback HTTP and a disposable PostgreSQL schema. Never boots production.
test("canonical server session middleware enforces PostgreSQL lifecycle over HTTP",{
 skip:!process.env.AGENT_HISTORY_TEST_DATABASE_URL,timeout:60000
},async()=>{
 const pool=new pg.Pool({connectionString:process.env.AGENT_HISTORY_TEST_DATABASE_URL,max:3,connectionTimeoutMillis:5000,query_timeout:10000});
 const user="real-auth-"+randomUUID(),tenant="real-auth-"+randomUUID(),sid=randomUUID();
 const token=randomUUID(),secret="disposable-agent-real-auth-ci-secret",cookie="bwcos_session="+token;
 const source=readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
 const extract=(start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,"missing real auth boundary "+start);return source.slice(a,b);
 };
 const code=[extract("function parseCookies(","function sha256("),
  extract("function sessionHash(","function authRateKey("),
  extract("async function loadSessionAuth(req){","function roles(")].join("\n");
 const ctx={crypto,Buffer,Date,pool,SESSION_COOKIE:"bwcos_session",
  config:{SESSION_SECRET:secret,PUBLIC_ORIGIN:"https://thebedesk.com"},
  nodeFetchMetadataAllowsBrowserMutation:site=>site==="same-origin",
  nodeRequestOriginAllowed:(origin,expected)=>origin===expected};
 const {auth}=runInNewContext(code+"\n({auth})",ctx,{timeout:2000});
 const app=express();app.get("/session-check",auth,(req,res)=>res.json({tenantId:req.auth.tenantId,role:req.auth.role}));
 const server=app.listen(0,"127.0.0.1");
 try{
  await pool.query("create table if not exists tenants (id text primary key,name text)");
  await pool.query("create table if not exists users (id text primary key,session_generation integer,email text)");
  await pool.query("create table if not exists memberships (user_id text,tenant_id text,status text,role text)");
  await pool.query("create table if not exists sessions (id uuid primary key,user_id text,tenant_id text,revoked_at timestamptz,expires_at timestamptz,session_generation integer,token_hash text,csrf_token text,last_seen_at timestamptz)");
  await pool.query("alter table users add column if not exists email text");
  await pool.query("alter table memberships add column if not exists role text");
  await pool.query("alter table sessions add column if not exists csrf_token text");
  await pool.query("alter table sessions add column if not exists last_seen_at timestamptz");
  await pool.query("insert into tenants(id,name) values($1,'isolated')",[tenant]);
  await pool.query("insert into users(id,session_generation,email) values($1,1,'ci@example.invalid')",[user]);
  await pool.query("insert into memberships(user_id,tenant_id,status,role) values($1,$2,'active','owner')",[user,tenant]);
  await pool.query("insert into sessions(id,user_id,tenant_id,expires_at,session_generation,token_hash,csrf_token,last_seen_at) values($1,$2,$3,now()+interval '1 hour',1,$4,'csrf',now())",[sid,user,tenant,createHmac("sha256",secret).update(token).digest("hex")]);
  if(!server.listening) await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject)});
  const url="http://127.0.0.1:"+server.address().port+"/session-check";
  const get=async value=>fetch(url,{headers:value?{cookie:value}:{},signal:AbortSignal.timeout(10000)});
  assert.equal((await get(null)).status,401);
  const ok=await get(cookie);assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{tenantId:tenant,role:"owner"});
  await pool.query("update sessions set revoked_at=now() where id=$1",[sid]);
  assert.equal((await get(cookie)).status,401,"revoked");
  await pool.query("update sessions set revoked_at=null,expires_at=now()-interval '1 minute' where id=$1",[sid]);
  assert.equal((await get(cookie)).status,401,"expired");
  await pool.query("update sessions set expires_at=now()+interval '1 hour',session_generation=0 where id=$1",[sid]);
  assert.equal((await get(cookie)).status,401,"stale generation");
  await pool.query("update sessions set session_generation=1 where id=$1",[sid]);
  await pool.query("update memberships set status='inactive' where user_id=$1",[user]);
  assert.equal((await get(cookie)).status,401,"inactive membership");
  await pool.query("update memberships set status='active' where user_id=$1",[user]);
  assert.equal((await get("bwcos_session="+randomUUID())).status,401,"forged cookie");
 }finally{
  server.closeAllConnections();
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  await pool.query("delete from sessions where id=$1",[sid]).catch(()=>{});
  await pool.query("delete from memberships where user_id=$1",[user]).catch(()=>{});
  await pool.query("delete from users where id=$1",[user]).catch(()=>{});
  await pool.query("delete from tenants where id=$1",[tenant]).catch(()=>{});
  await pool.end();
 }
});
