import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import staging from "../cloudflare/src/conversation-staging-entry.js";
import {conversationStagingConfig} from "../scripts/render-conversation-staging-config.mjs";

const origin="https://conversation-staging.thebedesk.com";
const databaseId="95c48030-0395-44cb-aa95-622beaf4efdf";
const profile=conversationStagingConfig({
 CONVERSATION_STAGING_D1_ID:databaseId,
 CONVERSATION_STAGING_SOURCE_SHA:"a".repeat(40),
 CONVERSATION_STAGING_MODE:"private-service",
 CONVERSATION_STAGING_ORIGIN:origin,
 CONVERSATION_STAGING_PRIVACY_APPROVED:"true",
 CONVERSATION_STAGING_MIGRATION_QUALIFIED:"true"
});
const sqlite=new DatabaseSync(":memory:");
try{
 sqlite.exec(readFileSync(new URL("../docs/rehearsals/conversation-storage-schema.sql",import.meta.url),"utf8"));
 sqlite.exec(`
 CREATE TABLE thebe_conversation_staging_identity(database_uuid TEXT NOT NULL);
 CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,display_name TEXT,onboarding_complete INTEGER,session_generation INTEGER);
 CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT);
 CREATE TABLE memberships(user_id TEXT,tenant_id TEXT,role TEXT,status TEXT);
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,tenant_id TEXT,role TEXT,public_id TEXT,csrf_token TEXT,created_at TEXT,last_seen_at TEXT,expires_at TEXT,session_generation INTEGER);
 INSERT INTO users VALUES ('alice','alice@example.invalid','Alice',1,1),('bob','bob@example.invalid','Bob',1,1);
 INSERT INTO tenants VALUES ('tenant-a','A'),('tenant-b','B');
 INSERT INTO memberships VALUES ('alice','tenant-a','owner','active'),('bob','tenant-b','owner','active');`);
 sqlite.prepare("INSERT INTO thebe_conversation_staging_identity VALUES (?)").run(databaseId);
 const secret="local-fixture-session-secret";
 const seed=sqlite.prepare("INSERT INTO sessions VALUES (?,?,?,'owner','synthetic',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,datetime('now','+1 hour'),1)");
 for(const [token,user,tenant,csrf] of [["alice-one","alice","tenant-a","csrf-one"],["alice-two","alice","tenant-a","csrf-two"],["bob-one","bob","tenant-b","csrf-bob"]]){
  seed.run(createHmac("sha256",secret).update(token).digest("hex"),user,tenant,csrf);
 }
 function bind(sql,...args){
  const stmt=sqlite.prepare(sql);
  return {
   first:()=>stmt.get(...args),
   all:()=>({success:true,results:stmt.all(...args)}),
   run:()=>({success:true,meta:{changes:stmt.run(...args).changes}})
  };
 }
 const DB={
  prepare(sql){return {...bind(sql),bind:(...args)=>bind(sql,...args)}},
  batch(statements){
   sqlite.exec("BEGIN");
   try{
    const results=statements.map(statement=>statement.run());
    sqlite.exec("COMMIT");
    return results;
   }catch(error){sqlite.exec("ROLLBACK");throw error}
  }
 };
 const env={...profile.vars,DB,SESSION_SECRET:secret,CONVERSATION_CURSOR_SECRET:"x".repeat(32)};
 const root="/api/conversation-staging/threads";
 const request=(path,{token,csrf,method="GET",body}={})=>{
  const headers=new Headers({origin});
  if(token)headers.set("cookie","__Host-bw_session="+token);
  if(csrf)headers.set("x-csrf-token",csrf);
  if(body){
   headers.set("content-type","application/json");
   if(body.exchange)headers.set("x-thebe-conversation-exchange","1");
  }
  return staging.fetch(new Request(origin+path,{method,headers,body:body&&JSON.stringify(body)}),env);
 };
 assert.equal((await request(root)).status,401);
 assert.equal((await request(root,{token:"alice-one",csrf:"wrong",method:"POST"})).status,403);
 const created=await request(root,{token:"alice-one",csrf:"csrf-one",method:"POST"});
 assert.equal(created.status,201);
 const {id}=await created.json();
 const messages=root+"/"+id+"/messages";
 assert.equal((await request(messages,{token:"alice-one",csrf:"csrf-one",method:"POST",body:{
  exchange:{question:"Synthetic question",answer:"Synthetic answer",idempotencyKey:"exchange-1"}
 }})).status,200);
 const threadUrl=root+"?"+new URLSearchParams({threadId:id});
 const rename={title:"Synthetic 100% progress"};
 assert.equal((await request(threadUrl,{token:"alice-two",csrf:"wrong",method:"PATCH",body:rename})).status,403);
 assert.equal((await request(threadUrl,{token:"bob-one",csrf:"csrf-bob",method:"PATCH",body:rename})).status,404);
 const renamed=await request(threadUrl,{token:"alice-two",csrf:"csrf-two",method:"PATCH",body:rename});
 assert.equal(renamed.status,200);
 assert.equal((await renamed.json()).title,rename.title);
 const searchUrl=root+"?"+new URLSearchParams({q:"100%"});
 const matches=await (await request(searchUrl,{token:"alice-one"})).json();
 assert.deepEqual(matches.items.map(row=>({id:row.id,title:row.title})),[{id,title:rename.title}]);
 assert.deepEqual((await (await request(searchUrl,{token:"bob-one"})).json()).items,[]);
 assert.deepEqual((await (await request(root+"?"+new URLSearchParams({q:"100_"}),{token:"alice-one"})).json()).items,[]);
 const retry=await request(messages,{token:"alice-two",csrf:"csrf-two",method:"POST",body:{
  exchange:{question:"Synthetic question",answer:"Synthetic answer",idempotencyKey:"exchange-1"}
 }});
 assert.equal(retry.status,200);
 assert.equal((await retry.json()).duplicate,true);
 assert.equal((await request(messages,{token:"alice-two",csrf:"csrf-two",method:"POST",body:{
  exchange:{question:"Synthetic question",answer:"Different answer",idempotencyKey:"exchange-1"}
 }})).status,409);
 const restored=await request(messages,{token:"alice-two"});
 assert.equal(restored.status,200);
 assert.deepEqual((await restored.json()).items.map(row=>row.content_redacted),["Synthetic answer","Synthetic question"]);
 assert.deepEqual((await (await request(root,{token:"bob-one"})).json()).items,[]);
 assert.equal((await request(messages,{token:"bob-one"})).status,401);
 const removed=await request(root+"?"+new URLSearchParams({threadId:id}),{token:"alice-two",csrf:"csrf-two",method:"DELETE"});
 assert.equal(removed.status,200);
 assert.equal((await request(messages,{token:"alice-one"})).status,401);
 assert.deepEqual((await (await request(root,{token:"alice-one"})).json()).items,[]);
 assert.deepEqual((await (await request(searchUrl,{token:"alice-one"})).json()).items,[]);
 assert.equal((await request(threadUrl,{token:"alice-one",csrf:"csrf-one",method:"PATCH",body:rename})).status,404);
 assert.equal((await request(messages,{token:"alice-one",csrf:"csrf-one",method:"POST",body:{
  exchange:{question:"Synthetic question",answer:"Synthetic answer",idempotencyKey:"exchange-1"}
 }})).status,401);
 sqlite.exec("UPDATE users SET session_generation=2 WHERE id='alice'");
 assert.equal((await request(root,{token:"alice-two"})).status,401);
}finally{sqlite.close()}
