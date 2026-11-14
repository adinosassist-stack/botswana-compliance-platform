import test from "node:test";
import assert from "node:assert/strict";
import {handleWorkspaceAgentTasksRequest} from "../cloudflare/src/workspace-agent-tasks-api.js";

const origin="https://thebedesk.com";
const session={user_id:"user-A",tenant_id:"tenant-A",role:"owner",csrf_token:"test-csrf"};
function harness({auth=session,result={success:true,results:[]},failure=false}={}){
 const calls={auth:[],tasks:[],writes:0};
 const env={
   SESSION_SECRET:"synthetic-offline-secret-not-connected-to-production",
   DB:{prepare(sql){
     if(!/^\s*SELECT\s+/i.test(sql)) { calls.writes++;throw Error("write_not_allowed");}
     if(sql.includes("FROM sessions s")){
       return {bind:(...args)=>{calls.auth.push({sql,args});return {
         first:async()=>auth
       }}};
     }
     if(sql.includes("FROM agent_responsibilities")){
       return {bind:(...args)=>{calls.tasks.push({sql,args});return {
         all:async()=>{if(failure)throw Error("offline_mock_table_missing");return result;}
       }}};
     }
     throw Error("unexpected_query");
   }}
 };
 const request=async(path="/api/agentic/workspace-tasks?workspace=owner",{method="GET",cookie=true}={})=>{
   const headers=cookie?{cookie:"bw_session=synthetic-offline-session"}:{};
   const response=await handleWorkspaceAgentTasksRequest({
     request:new Request(origin+path,{method,headers}),env
   });
   return {status:response.status,body:await response.json(),cache:response.headers.get("cache-control")};
 };
 return {calls,request};
}
test("D1 tasks remain tenant-bound, GET-only and advisory despite spoofed query identities",async()=>{
 const h=harness({result:{success:true,results:[{id:"A1",objective:"Review synthetic books",workspace:"finance"}]}});
 const result=await h.request("/api/agentic/workspace-tasks?workspace=finance&tenantId=tenant-B&userId=user-B");
 assert.equal(result.status,200);
 assert.equal(result.cache,"no-store");
 assert.equal(result.body.tasks.length,1);
 assert.deepEqual(h.calls.tasks[0].args,["tenant-A","finance"]);
 const task=result.body.tasks[0];
 assert.equal(task.tenantId,"tenant-A");
 assert.equal(task.userId,"user-A");
 assert.equal(task.authority,"recommendation_only");
 assert.equal(task.approvalRequired,true);
 assert.equal(task.executionAllowed,false);
 assert.equal(task.externalSideEffects,false);
 assert.equal(h.calls.writes,0);
 assert.match(h.calls.tasks[0].sql,/status='active'/);
 assert.match(h.calls.tasks[0].sql,/LIMIT 24/);
});
test("D1 workspace query rejects duplicates, empty values and unexpected scopes before responsibilities query",async()=>{
 const invalid=[
   "?workspace=",
   "?workspace",
   "?workspace=owner&workspace=finance",
   "?workspace=owner&workspace=owner",
   "?workspace=finance&workspace=",
   "?workspace=__proto__",
   "?workspace=%20",
   "?workspace=payments"
 ];
 for(const suffix of invalid){
   const h=harness();
   const result=await h.request("/api/agentic/workspace-tasks"+suffix);
   assert.equal(result.status,400,suffix);
   assert.deepEqual(result.body,{error:"invalid_workspace"});
   assert.equal(h.calls.tasks.length,0);
   assert.equal(h.calls.writes,0);
 }
});
test("D1 absent workspace defaults only to permitted owner scope",async()=>{
 const h=harness({result:{success:true,results:[]}});
 const r=await h.request("/api/agentic/workspace-tasks");
 assert.equal(r.status,200);
 assert.deepEqual(h.calls.tasks[0].args,["tenant-A","owner"]);
 assert.deepEqual(r.body.tasks,[]);
});
test("D1 malformed or failed result returns 503 instead of falsely claiming empty verified tasks",async()=>{
 const bad=[
   null,undefined,{},{success:false,results:[]},
   {success:true},{success:true,results:null},
   {results:{}},{results:Array.from({length:25},(_,i)=>({id:"task"+i,objective:"Review"}))}
 ];
 for(const result of bad){
   const h=harness({result});
   const response=await h.request();
   assert.equal(response.status,503,String(result));
   assert.deepEqual(response.body,{error:"task_source_unavailable"});
   assert.equal(h.calls.tasks.length,1);
   assert.equal(h.calls.writes,0);
 }
 const fail=harness({failure:true});
 assert.equal((await fail.request()).status,503);
});
test("D1 valid empty response is distinguishable from a backend error",async()=>{
 const h=harness({result:{success:true,results:[]}});
 const r=await h.request();
 assert.equal(r.status,200);
 assert.deepEqual(r.body,{ok:true,code:"tasks_planned",tasks:[]});
 assert.equal(h.calls.tasks.length,1);
});
test("D1 unauthorized roles and non-GET methods never read responsibility rows",async()=>{
 for(const role of ["reviewer","auditor","employee"]){
   const h=harness({auth:{...session,role}});
   assert.equal((await h.request()).status,403);
   assert.equal(h.calls.tasks.length,0);
 }
 const missing=harness({auth:null});
 assert.equal((await missing.request()).status,401);
 for(const method of ["POST","PUT","PATCH","DELETE"]){
   const h=harness();
   assert.equal((await h.request("/api/agentic/workspace-tasks",{method})).status,405);
   assert.equal(h.calls.auth.length,0);
   assert.equal(h.calls.tasks.length,0);
 }
});
