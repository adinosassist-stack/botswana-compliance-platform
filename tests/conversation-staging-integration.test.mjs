import assert from "node:assert/strict";
import {createConversationStagingIntegration} from "../cloudflare/src/conversation-staging-integration-rehearsal.js";
const origin="https://conversation-staging.example.invalid";
const path=origin+"/api/conversation-staging/threads/thread/messages";
const envBase={APP_ENV:"staging",DEPLOYMENT_ENV:"staging",DEPLOYMENT_PROFILE:"conversation-staging",CONVERSATION_HISTORY_STAGING_ENABLED:"true",CONVERSATION_STAGING_ORIGIN:origin};
let calls=[],session={authenticated:true,active:true,userId:"u",tenantId:"A",csrfVerified:true};
const db={prepare(sql){return{bind(...params){return{
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
