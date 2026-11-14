import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { registerPrivateNodeWorkspaceAgent } from "../server/workspace-agent-node-private.js";

// Entirely synthetic, loopback-only HTTP contract harness. This does NOT
// impersonate the real Node session validator or use a live PostgreSQL DB.
const TENANT_A = "6511c1df-17c5-46e1-a026-e1b0f343cc51";
const TENANT_B = "ed38877e-ae5b-4a3e-b8b1-226bf7c5a615";
const USER_A = "25c5acb1-c91b-4c2a-8c46-65c4e27c0121";
const USER_B = "4363794f-7549-4e9f-a4ae-35d70dd7e0e0";
const SESSIONS = {
  "owner-A": { role: "owner", user_id: USER_A, tenant_id: TENANT_A },
  "manager-B": { role: "manager", user_id: USER_B, tenant_id: TENANT_B },
  "reviewer-A": { role: "reviewer", user_id: USER_A, tenant_id: TENANT_A },
  "auditor-B": { role: "auditor", user_id: USER_B, tenant_id: TENANT_B }
};
const ROWS = [
  {id:"A-owner",objective:"Owner A active advisory",workspace:"owner",tenant:TENANT_A},
  {id:"A-finance",objective:"Finance A active advisory",workspace:"finance",tenant:TENANT_A},
  {id:"B-owner",objective:"Owner B active advisory",workspace:"owner",tenant:TENANT_B},
  {id:"B-finance",objective:"Finance B active advisory",workspace:"finance",tenant:TENANT_B}
];

async function harness({appEnv="test",enabled=true,missingSchema=false}={}) {
  const app=express();
  const sessions={...SESSIONS};
  const sqlCalls=[];
  let mutations=0;
  const fakeAuthenticatedSession=(req,res,next)=>{
    const session=sessions[req.get("x-synthetic-session")];
    if (!session) return res.status(401).json({error:"unauthenticated"});
    req.auth={...session}; // This is a TEST fixture only, never in application code.
    next();
  };
  const pool={query:async(sql,params)=>{
    sqlCalls.push({sql,params});
    if (!/^\s*SELECT\s+/i.test(sql)) {mutations++;throw Error("read_only_fixture");}
    if (missingSchema)throw Error("relation does not exist");
    assert.match(sql,/WHERE tenant_id=\$1 AND workspace=\$2 AND status='active'/);
    assert.match(sql,/ORDER BY updated_at DESC LIMIT 24/);
    const [tenant,workspace]=params;
    return {rows:ROWS.filter(row=>row.tenant===tenant && row.workspace===workspace)
      .map(({id,objective,workspace})=>({id,objective,workspace}))};
  }};
  const registered=registerPrivateNodeWorkspaceAgent({
    app,sessionAuth:fakeAuthenticatedSession,pool,appEnv,enabled
  });
  app.use((_req,res)=>res.status(404).json({error:"not_found"}));
  const server=http.createServer(app);
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  const origin="http://127.0.0.1:"+server.address().port;
  const request=async(path,{session="owner-A",method="GET"}={})=>{
    const headers={};
    if(session!==null)headers["x-synthetic-session"]=session;
    const response=await fetch(origin+path,{method,headers,redirect:"manual"});
    return {status:response.status,headers:response.headers,body:await response.json()};
  };
  const close=()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return {registered,sessions,sqlCalls,readMutations:()=>mutations,request,close};
}

test("private Node HTTP routes are completely absent outside explicit test opt-in",async()=>{
  for(const options of [
    {appEnv:"production",enabled:true},{appEnv:"development",enabled:true},
    {appEnv:"test",enabled:false}
  ]) {
    const h=await harness(options);
    try {
      assert.equal(h.registered,false);
      assert.equal((await h.request("/api/agentic/workspace-identity")).status,404);
      assert.equal((await h.request("/api/agentic/workspace-tasks")).status,404);
      assert.equal(h.sqlCalls.length,0);
    } finally {await h.close()}
  }
});

test("private Node HTTP identity binds opaque session tenant and user; ignores forged query",async()=>{
  const h=await harness();
  try {
    assert.equal(h.registered,true);
    const a=await h.request("/api/agentic/workspace-identity?tenantId="+TENANT_B+"&userId="+USER_B);
    assert.equal(a.status,200);
    assert.deepEqual(a.body,{ok:true,tenantId:TENANT_A,userId:USER_A});
    assert.equal(a.headers.get("cache-control"),"no-store");
    assert.equal(a.headers.get("x-content-type-options"),"nosniff");
    const b=await h.request("/api/agentic/workspace-identity",{session:"manager-B"});
    assert.deepEqual(b.body,{ok:true,tenantId:TENANT_B,userId:USER_B});
    for(const session of ["reviewer-A","auditor-B"]) {
      assert.equal((await h.request("/api/agentic/workspace-identity",{session})).status,403);
    }
    assert.equal((await h.request("/api/agentic/workspace-identity",{session:null})).status,401);
    assert.equal(h.sqlCalls.length,0);
  } finally {await h.close()}
});

test("Node HTTP advisory task snapshots are tenant-bound, read-only and capped",async()=>{
  const h=await harness();
  try {
    for(const [session,scope,expectedTenant,expectedUser,expectedId] of [
      ["owner-A","finance",TENANT_A,USER_A,"A-finance"],
      ["manager-B","finance",TENANT_B,USER_B,"B-finance"],
      ["owner-A","owner",TENANT_A,USER_A,"A-owner"],
      ["manager-B","owner",TENANT_B,USER_B,"B-owner"]
    ]) {
      const result=await h.request(
        "/api/agentic/workspace-tasks?workspace="+scope+"&tenantId=forged&userId=forged",
        {session}
      );
      assert.equal(result.status,200);
      assert.equal(result.headers.get("cache-control"),"no-store");
      assert.equal(result.body.tasks.length,1);
      const task=result.body.tasks[0];
      assert.equal(task.id,expectedId);
      assert.equal(task.tenantId,expectedTenant);
      assert.equal(task.userId,expectedUser);
      assert.equal(task.workspace,scope);
      assert.equal(task.authority,"recommendation_only");
      assert.equal(task.approvalRequired,true);
      assert.equal(task.executionAllowed,false);
      assert.equal(task.externalSideEffects,false);
    }
    assert.deepEqual(h.sqlCalls.map(x=>x.params),[
      [TENANT_A,"finance"],[TENANT_B,"finance"],[TENANT_A,"owner"],[TENANT_B,"owner"]
    ]);
    assert.equal(h.readMutations(),0);
  } finally {await h.close()}
});

test("Node HTTP denials do not read tasks or allow any mutation",async()=>{
  const h=await harness();
  try {
    for(const method of ["POST","PUT","PATCH","DELETE"]){
      const p=await h.request("/api/agentic/workspace-identity",{method});
      assert.equal(p.status,405);
      assert.equal((await h.request("/api/agentic/workspace-tasks",{method})).status,405);
    }
    assert.equal((await h.request("/api/agentic/workspace-tasks?workspace=__proto__")).status,400);
    assert.equal((await h.request("/api/agentic/workspace-tasks?workspace=owner&workspace=finance")).status,400);
    assert.equal((await h.request("/api/agentic/workspace-tasks",{session:"reviewer-A"})).status,403);
    assert.equal((await h.request("/api/agentic/workspace-tasks",{session:null})).status,401);
    assert.equal(h.sqlCalls.length,0);
    assert.equal(h.readMutations(),0);
    // Synthetic revocation: the same browser token cannot regain task access.
    delete h.sessions["owner-A"];
    assert.equal((await h.request("/api/agentic/workspace-tasks")).status,401);
    assert.equal(h.sqlCalls.length,0);
  } finally {await h.close()}
});

test("missing private PostgreSQL schema returns 503 rather than synthetic tasks",async()=>{
  const h=await harness({missingSchema:true});
  try {
    const result=await h.request("/api/agentic/workspace-tasks?workspace=owner");
    assert.equal(result.status,503);
    assert.deepEqual(result.body,{error:"task_source_unavailable"});
    assert.equal(result.headers.get("cache-control"),"no-store");
    assert.equal(h.sqlCalls.length,1);
    assert.equal(h.readMutations(),0);
  } finally {await h.close()}
});
