import test from "node:test";
import assert from "node:assert/strict";
import { registerPrivateNodeWorkspaceAgent } from "../server/workspace-agent-node-private.js";

function harness({appEnv="test",enabled=true,role="owner",tenantId="tenant-A",userId="user-A",rows=[],rejectQuery=false}={}) {
  const routes=new Map(), queries=[];
  const app={all(path,auth,handler){routes.set(path,{auth,handler})}};
  const sessionAuth=(req,res,next)=>next();
  const pool={query:async(sql,values)=>{
    queries.push({sql,values});
    if(rejectQuery)throw Error("Postgres relation missing");
    return {rows};
  }};
  const registered=registerPrivateNodeWorkspaceAgent({app,sessionAuth,pool,appEnv,enabled});
  async function request(path,{method="GET",workspace,session={
    tenant_id:tenantId,user_id:userId,role
  },query={}}={}) {
    if (!routes.has(path))return null;
    const res={
      statusCode:200,headers:{},
      status(code){this.statusCode=code;return this},
      set(name,value){this.headers[name.toLowerCase()]=value;return this},
      json(body){this.body=body;return this}
    };
    const req={method,auth:session,query:workspace===undefined?query:{...query,workspace}};
    await routes.get(path).handler(req,res);
    return {status:res.statusCode,headers:res.headers,body:res.body};
  }
  return {registered,routes,queries,request};
}
const identity="/api/agentic/workspace-identity", tasks="/api/agentic/workspace-tasks";

test("disabled unless explicitly test-only; production cannot register even with opt-in",()=>{
 for(const options of [{appEnv:"production",enabled:true},{appEnv:"development",enabled:true},{appEnv:"test",enabled:false},{appEnv:"test",enabled:undefined}]){
  const h=harness(options);assert.equal(h.registered,false);assert.equal(h.routes.size,0);
 }
});
test("requires authenticated opaque session identifiers for identity",async()=>{
 const h=harness();
 const allowed=await h.request(identity);
 assert.equal(allowed.status,200);
 assert.deepEqual(allowed.body,{ok:true,tenantId:"tenant-A",userId:"user-A"});
 assert.equal(allowed.headers["cache-control"],"no-store");
 assert.equal(allowed.headers["x-content-type-options"],"nosniff");
 assert.equal(h.queries.length,0);
 for(const session of [null,{}, {tenant_id:"tenant-A",role:"owner"},{user_id:"user-A",role:"owner"}]){
  const denied=await h.request(identity,{session});
  assert.equal(denied.status,401);
 }
});
test("rejects reviewer/auditor and arbitrary roles; mutation methods fail closed",async()=>{
 for(const role of ["reviewer","auditor","employee","platform_admin"]){
  const h=harness({role});assert.equal((await h.request(identity)).status,403);
  assert.equal((await h.request(tasks)).status,403);
  assert.equal(h.queries.length,0);
 }
 const h=harness();
 for(const method of ["POST","PUT","PATCH","DELETE"]){
  assert.equal((await h.request(identity,{method})).status,405);
  assert.equal((await h.request(tasks,{method})).status,405);
 }
 assert.equal(h.queries.length,0);
});
test("tasks query is tenant-bound, parameterized, limited and read-only",async()=>{
 const h=harness({tenantId:"tenant-A",userId:"user-A",rows:[
  {id:"task1",objective:"Review upcoming obligations",workspace:"owner"},
  {id:"task2",objective:"Check outstanding risk",workspace:"owner"}
 ]});
 const r=await h.request(tasks,{workspace:"owner",query:{tenantId:"attacker",userId:"attacker"}});
 assert.equal(r.status,200);
 assert.equal(r.body.tasks.length,2);
 assert.ok(r.body.tasks.every(task=>
  task.tenantId==="tenant-A"&&task.userId==="user-A"&&task.workspace==="owner"&&
  task.executionAllowed===false&&task.approvalRequired===true&&
  task.externalSideEffects===false&&task.authority==="recommendation_only"));
 assert.deepEqual(h.queries[0].values,["tenant-A","owner"]);
 assert.match(h.queries[0].sql,/tenant_id=\$1 AND workspace=\$2 AND status='active'/);
 assert.match(h.queries[0].sql,/LIMIT 24/);
 assert.doesNotMatch(h.queries[0].sql,/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i);
});
test("only workspace allowlist is accepted; disallowed and forged scopes never query",async()=>{
 const h=harness();
 for(const workspace of ["finance';DELETE",[],"payments","",["owner","other"],"__proto__"]){
  const r=await h.request(tasks,{workspace});
  if(workspace==="")assert.equal(r.status,200);
  else assert.equal(r.status,400);
 }
 assert.equal(h.queries.length,1);
});
test("manager read-only scope supported",async()=>{
 const h=harness({role:"manager",rows:[{id:"t",objective:"Review",workspace:"finance"}]});
 const r=await h.request(tasks,{workspace:"finance"});
 assert.equal(r.status,200);assert.equal(r.body.tasks[0].workspace,"finance");
});
test("missing Postgres responsibilities table fails closed; never invent tasks",async()=>{
 const h=harness({rejectQuery:true});
 const r=await h.request(tasks,{workspace:"owner"});
 assert.equal(r.status,503);
 assert.deepEqual(r.body,{error:"task_source_unavailable"});
 assert.equal(h.queries.length,1);
});
test("candidate window is bounded to six advisory tasks by shared Cloudflare planner",async()=>{
 const rows=Array.from({length:24},(_,i)=>({id:"t"+i,objective:"Review #"+i,workspace:"owner"}));
 const h=harness({rows});
 const r=await h.request(tasks,{workspace:"owner"});
 assert.equal(r.status,200);assert.equal(r.body.tasks.length,6);
 assert.ok(r.body.tasks.every(t=>t.state==="queued"));
});
