import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {handleAgenticRequest} from "../cloudflare/src/agentic-core.js";

const ownerSource=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const calls=[];
let workspaceRole="owner",failure=false;
const plan={run:{id:"run-a",goal:"Reduce overdue collections",summary:"Review the recorded overdue balances."},proposals:[{id:"p-a",run_id:"run-a",title:"Review collections",status:"pending",sourceRefs:["receivables"]}]};
const global={
  currentWorkspaceRole:()=>workspaceRole,
  dispatchEvent(){},
  apiJson:async(path,options={})=>{
    calls.push({path,options});
    if(failure)throw new Error("Source unavailable");
    if(path==="/api/agentic/plan")return plan;
    if(path==="/api/agentic/runs")return {items:[plan.run],proposals:[...plan.proposals,{id:"other",run_id:"other-run"}]};
    throw new Error("Unexpected request "+path);
  }
};
vm.runInNewContext(ownerSource,{window:global,document:{readyState:"loading",addEventListener(){},querySelector(){return null}},CustomEvent:class{},console});
const control=global.ThebeOwnerCommandCentre;
assert.equal((await control.generatePlan("Reduce overdue collections")).run.id,"run-a");
assert.equal(JSON.parse(calls[0].options.body).goal,"Reduce overdue collections");
const saved=await control.loadLatestPlan();
assert.equal(saved.proposals.length,1,"resume must not mix another run's proposals");
assert.equal(saved.proposals[0].sourceRefs[0],"receivables");
failure=true;
await assert.rejects(control.generatePlan("Review cash"),/Source unavailable/);
failure=false;workspaceRole="employee";
const prior=calls.length;
await assert.rejects(control.generatePlan("Review cash"),/owners and managers/);
await assert.rejects(control.loadLatestPlan(),/owners and managers/);
assert.equal(calls.length,prior,"unauthorized roles must not call planning APIs");

const queryCalls=[];
const DB={prepare(sql){const statement={sql,bindings:[],bind(...bindings){this.bindings=bindings;return this},async first(){return {user_id:"owner",tenant_id:"tenant-a",role:"owner",csrf_token:"token"}},async all(){queryCalls.push(this);return {results:sql.includes("FROM agentic_runs")?[plan.run]:[{...plan.proposals[0],reason:"Recorded overdue balance",source_refs_json:'["receivables"]'}]}}};return statement}};
const response=await handleAgenticRequest({request:new Request("https://thebedesk.com/api/agentic/runs",{headers:{cookie:"bw_session=session"}}),logicalPath:"/api/agentic/runs",env:{DB,SESSION_SECRET:"x".repeat(32)},ctx:{},coreFetch:async()=>{throw new Error("reads must not invoke an advisor")}});
assert.equal(response.status,200);
const body=await response.json();
assert.equal(body.proposals[0].reason,"Recorded overdue balance");
assert.deepEqual(body.proposals[0].sourceRefs,["receivables"]);
assert.equal(body.proposals[0].source_refs_json,undefined);
assert.equal(body.authority.executionEnabled,false);
assert.ok(queryCalls.every(call=>call.bindings[0]==="tenant-a"),"saved artifacts must remain tenant-scoped");

const core=fs.readFileSync("cloudflare/src/agentic-core.js","utf8");
assert.match(core,/USER_GOAL \$\{JSON\.stringify\(goal\)\}/,"planner must receive the actual owner goal");
console.log("UNIFIED_GOAL_FLOW_RUNTIME_PASS");
