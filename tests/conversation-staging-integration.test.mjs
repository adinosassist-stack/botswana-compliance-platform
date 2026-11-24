import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createConversationStagingIntegration} from "../cloudflare/src/conversation-staging-integration-rehearsal.js";
const origin="https://conversation-staging.example.invalid";
const path=origin+"/api/conversation-staging/threads/thread/messages";
const envBase={APP_ENV:"staging",DEPLOYMENT_ENV:"staging",DEPLOYMENT_PROFILE:"conversation-staging",CONVERSATION_HISTORY_STAGING_ENABLED:"true",CONVERSATION_STAGING_ORIGIN:origin,CONVERSATION_STAGING_D1_ID:"95c48030-0395-44cb-aa95-622beaf4efdf"};
let calls=[],session={authenticated:true,active:true,userId:"u",tenantId:"A",csrfVerified:true};
const db={prepare(sql){if(sql.includes("thebe_conversation_staging_identity"))return {async first(){return {database_uuid:"95c48030-0395-44cb-aa95-622beaf4efdf",marker_count:1}}};return{bind(...params){return{
 async first(){calls.push({sql,params});if(sql.includes("conversation_members"))return {tenant_id:"A",conversation_id:"thread",user_id:"u",role:"member",active:1};
 if(sql.includes("thebe_conversations_rehearsal"))return {tenant_id:"A",id:"thread",status:"active"};
 return null},
 async all(){calls.push({sql,params});return{results:[]}},
 async run(){calls.push({sql,params});return{success:true,meta:{changes:1}}}
 }}}}};
const worker=createConversationStagingIntegration({verifyCurrentSession:async()=>session});
const env={...envBase,DB:db};
assert.throws(()=>createConversationStagingIntegration(),/server_session_verifier_required/);
let response=await worker.fetch(new Request(path),{...env,DEPLOYMENT_ENV:"production"});
assert.equal(response.status,404);assert.equal(calls.length,0);
response=await worker.fetch(new Request(path),env);
assert.equal(response.status,200);assert.equal((await response.json()).items.length,0);
assert.deepEqual(calls.slice(0,2).map(x=>x.params),[["A","thread","u"],["A","thread"]]);
calls=[];
session={...session,tenantId:"B"};
response=await worker.fetch(new Request(path),env);
assert.equal(response.status,401);assert.equal(calls.filter(x=>x.sql.includes("INSERT")).length,0);
session={authenticated:true,active:true,userId:"u",tenantId:"A",csrfVerified:true};
calls=[];
const payload=JSON.stringify({role:"user",sourceKind:"voice_final",content:"Hello from voice",idempotencyKey:"key1"});
response=await worker.fetch(new Request(path,{method:"POST",headers:{"content-type":"application/json"},body:payload,duplex:"half"}),env);
assert.equal(response.status,200);assert.equal(calls.filter(x=>x.sql.includes("INSERT")).length,1);
calls=[];
session={...session,csrfVerified:false};
response=await worker.fetch(new Request(path,{method:"POST",headers:{"content-type":"application/json"},body:payload,duplex:"half"}),env);
assert.equal(response.status,403);assert.equal(calls.filter(x=>x.sql.includes("INSERT")).length,0);
console.log("Consolidated conversation staging authentication, tenant isolation, typed/voice storage boundary PASS");

const directory=origin+"/api/conversation-staging/threads?threadId=thread";
const deleteThread=()=>worker.fetch(new Request(directory,{method:"DELETE",headers:{origin}}),env);
calls=[];
assert.equal((await deleteThread()).status,403);
assert.equal(calls.length,0,"CSRF denial must precede deletion");
session={...session,csrfVerified:true};
const deleted=await deleteThread();
assert.equal(deleted.status,200);
assert.deepEqual(await deleted.json(),{ok:true,id:"thread"});
assert.equal(calls.length,1);
assert.deepEqual(calls[0].params,["A","thread","A","thread","u"]);
assert.match(calls[0].sql,/status='active'.*role='owner' AND active=1/);

const sqlite=new DatabaseSync(":memory:");
try{
 sqlite.exec(readFileSync(new URL("../docs/rehearsals/conversation-storage-schema.sql",import.meta.url),"utf8"));
 sqlite.exec(`CREATE TABLE thebe_conversation_staging_identity(database_uuid TEXT);
 INSERT INTO thebe_conversation_staging_identity VALUES ('95c48030-0395-44cb-aa95-622beaf4efdf');
 INSERT INTO thebe_conversations_rehearsal(tenant_id,id,created_by_user_id) VALUES ('A','thread','u'),('B','thread','v');
 INSERT INTO thebe_conversation_members_rehearsal(tenant_id,conversation_id,user_id,role)
 VALUES ('A','thread','u','owner'),('A','thread','other','member'),('B','thread','v','owner');`);
 const database={prepare(sql){
  const stmt=sqlite.prepare(sql);
  return {first:()=>stmt.get(),bind:(...args)=>({
   run:()=>({success:true,meta:{changes:stmt.run(...args).changes}}),
   all:()=>({success:true,results:stmt.all(...args)})
  })};
 }};
 const realEnv={...env,DB:database};
 const rename=(body)=>worker.fetch(new Request(directory,{method:"PATCH",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)}),realEnv);
 const search=q=>worker.fetch(new Request(origin+"/api/conversation-staging/threads?"+new URLSearchParams({q})),realEnv);
 const remove=()=>worker.fetch(new Request(directory,{method:"DELETE",headers:{origin}}),realEnv);
 session={...session,userId:"other"};
 assert.equal((await rename({title:"Outside scope"})).status,404);
 assert.equal((await remove()).status,404);
 session={...session,userId:"u",tenantId:"B"};
 assert.equal((await rename({title:"Outside scope"})).status,404);
 assert.equal((await remove()).status,404);
 session={...session,tenantId:"A",csrfVerified:false};
 assert.equal((await rename({title:"Blocked"})).status,403);
 session={...session,csrfVerified:true};
 assert.equal((await rename({title:"a".repeat(121)})).status,400);
 assert.equal((await rename({title:"a".repeat(2050)})).status,413);
 assert.equal((await rename({title:"Override",tenantId:"B"})).status,400);
 const renamed=await rename({title:"  Quarterly planning  "});
 assert.equal(renamed.status,200);
 assert.deepEqual(await renamed.json(),{ok:true,id:"thread",title:"Quarterly planning"});
 const readback=await worker.fetch(new Request(origin+"/api/conversation-staging/threads"),realEnv);
 assert.equal((await readback.json()).items[0].title,"Quarterly planning");
 const matches=await search("  QUARTERLY ");
 assert.equal(matches.status,200);
 assert.deepEqual((await matches.json()).items.map(x=>x.id),["thread"]);
 assert.deepEqual((await (await search("%")).json()).items,[]);
 assert.equal((await search("a".repeat(121))).status,400);
 sqlite.prepare("UPDATE thebe_conversations_rehearsal SET title=? WHERE tenant_id='B'").run("Other tenant only");
 assert.deepEqual((await (await search("Other tenant")).json()).items,[]);
 sqlite.prepare("UPDATE thebe_conversations_rehearsal SET title=NULL WHERE tenant_id='B'").run();
 assert.equal((await remove()).status,200);
 assert.deepEqual((await (await search("Quarterly")).json()).items,[]);
 assert.equal((await rename({title:"Deleted"})).status,404);
 assert.equal((await remove()).status,404);
 const list=await worker.fetch(new Request(origin+"/api/conversation-staging/threads"),realEnv);
 assert.deepEqual((await list.json()).items,[]);
 assert.equal(sqlite.prepare("SELECT status,title FROM thebe_conversations_rehearsal WHERE tenant_id='B'").get().status,"active");
 assert.equal(sqlite.prepare("SELECT title FROM thebe_conversations_rehearsal WHERE tenant_id='B'").get().title,null);
}finally{sqlite.close()}
