import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {runFinanceWatchTask} from "../cloudflare/src/finance-watch-durable-loop.js";
import {FINANCE_WATCH_READ_ACTIONS,buildFinanceWatchDueQuery,isFinanceWatchToolList} from "../cloudflare/src/finance-watch-contract.js";

assert.deepEqual([...FINANCE_WATCH_READ_ACTIONS],[
  "financial_position.read",
  "finance_data_quality.read",
  "finance_daily_inflows.read",
  "receivables_summary.read"
]);
assert.equal(isFinanceWatchToolList(["financial_position.read"]),true);
assert.equal(isFinanceWatchToolList(["financial_position.read","compliance_status.read"]),false);
assert.equal(isFinanceWatchToolList([]),false);
assert.equal(isFinanceWatchToolList(["financial_position.read","financial_position.read"]),false,"duplicate finance tools must fail closed");

let touched=false;
const rejectingDB={prepare(){touched=true;throw new Error("D1 must not be touched for an ineligible task")}};
const rejected=await runFinanceWatchTask({
  env:{DB:rejectingDB},
  task:{id:"generic-task",tenant_id:"tenant-a",allowed_tools_json:JSON.stringify(["compliance_status.read"])}
});
assert.equal(rejected.ok,false);
assert.equal(rejected.persisted,false);
assert.equal(rejected.code,"invalid_finance_watch_tools");
assert.equal(rejected.executionAllowed,false);
assert.equal(rejected.externalActions,0);
assert.equal(touched,false,"ineligible direct Finance Watch invocation must fail before D1 access");

const due=buildFinanceWatchDueQuery(25);
assert.equal(due.bindings.length,FINANCE_WATCH_READ_ACTIONS.length+1);
assert.equal(due.bindings.at(-1),25);
assert.match(due.sql,/json_valid\(agent_persistent_tasks\.allowed_tools_json\)/);
assert.match(due.sql,/json_each/);
assert.match(due.sql,/value NOT IN/);
assert.match(due.sql,/trigger_kind='scheduled'/);
assert.match(due.sql,/next_run_at<=strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/,"due comparison must use the same canonical ISO text format as stored next_run_at");
assert.match(due.sql,/COUNT\(DISTINCT value\)/,"duplicate tool entries must be excluded in D1 before execution");

const migration=fs.readFileSync("cloudflare/migrations/055_v151_finance_watch_scheduler_isolation.sql","utf8");
assert.match(migration,/CREATE INDEX IF NOT EXISTS agent_persistent_tasks_scheduler_due/);
assert.match(migration,/ON agent_persistent_tasks\(next_run_at,id\)/);
assert.match(migration,/WHERE status='active' AND trigger_kind='scheduled' AND next_run_at IS NOT NULL/);

const root=process.cwd();
const wrangler=path.join(root,"node_modules",".bin",process.platform==="win32"?"wrangler.cmd":"wrangler");
const config=path.join(root,"tests","fixtures","wrangler-d1-finance-watch-isolation.toml");
assert.equal(fs.existsSync(wrangler),true,"pinned Wrangler binary must be installed");
assert.equal(fs.existsSync(config),true,"local D1 isolation config must exist");

const persist=fs.mkdtempSync(path.join(os.tmpdir(),"thebe-d1-finance-isolation-"));
const port=8795,base=`http://127.0.0.1:${port}`;let output="";
const child=spawn(wrangler,["dev","--config",config,"--persist-to",persist,"--ip","127.0.0.1","--port",String(port),"--log-level","error"],{
  cwd:root,env:{...process.env,CI:"true"},stdio:["ignore","pipe","pipe"]
});
child.stdout.on("data",chunk=>{output+=String(chunk)});
child.stderr.on("data",chunk=>{output+=String(chunk)});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function waitForHealth(){
  for(let attempt=0;attempt<80;attempt++){
    if(child.exitCode!==null)throw new Error(`wrangler exited before isolation health check: ${child.exitCode}\n${output.slice(-4000)}`);
    try{const response=await fetch(base+"/health");if(response.ok)return}catch{}
    await sleep(250);
  }
  throw new Error(`Finance Watch isolation worker did not become ready\n${output.slice(-4000)}`);
}

try{
  await waitForHealth();
  const response=await fetch(base+"/probe",{method:"POST"});
  const raw=await response.text();
  assert.equal(response.ok,true,`Finance Watch isolation probe returned HTTP ${response.status}\nbody: ${raw.slice(0,4000)}\nwrangler: ${output.slice(-4000)}`);
  const body=JSON.parse(raw);
  assert.deepEqual(body.selected,["finance-due","receivables-due"],"only active due unique finance-read scheduled tasks may enter Finance Watch");
  assert.ok(Date.parse(body.due)<Date.parse(body.clock)&&Date.parse(body.future)>Date.parse(body.clock),"D1 fixture must test tasks immediately around the same runtime clock");
  assert.ok(body.plan.some(detail=>detail.includes("agent_persistent_tasks_scheduler_due")),"D1 query plan must use the scheduler due index");
  console.log("v151 Finance Watch task isolation and scheduler index passed");
}finally{
  if(child.exitCode===null)child.kill("SIGTERM");
  await Promise.race([new Promise(resolve=>child.once("exit",resolve)),sleep(3000)]);
  try{fs.rmSync(persist,{recursive:true,force:true})}catch{}
}
