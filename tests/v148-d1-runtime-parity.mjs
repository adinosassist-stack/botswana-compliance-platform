import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";

const root=process.cwd();
const wrangler=path.join(root,"node_modules",".bin",process.platform==="win32"?"wrangler.cmd":"wrangler");
const config=path.join(root,"tests","fixtures","wrangler-d1-runtime-parity.toml");
assert.equal(fs.existsSync(wrangler),true,"pinned Wrangler binary must be installed");
assert.equal(fs.existsSync(config),true,"local D1 parity config must exist");

const persist=fs.mkdtempSync(path.join(os.tmpdir(),"thebe-d1-runtime-parity-"));
const port=8794;
const base=`http://127.0.0.1:${port}`;
let output="";
const child=spawn(wrangler,[
  "dev",
  "--config",config,
  "--persist-to",persist,
  "--ip","127.0.0.1",
  "--port",String(port),
  "--log-level","error"
],{cwd:root,env:{...process.env,CI:"true"},stdio:["ignore","pipe","pipe"]});
child.stdout.on("data",chunk=>{output+=String(chunk)});
child.stderr.on("data",chunk=>{output+=String(chunk)});

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForHealth(){
  for(let attempt=0;attempt<80;attempt++){
    if(child.exitCode!==null)throw new Error(`wrangler exited before health check: ${child.exitCode}\n${output.slice(-4000)}`);
    try{
      const response=await fetch(base+"/health");
      if(response.ok)return;
    }catch{}
    await sleep(250);
  }
  throw new Error(`wrangler local D1 worker did not become ready\n${output.slice(-4000)}`);
}

try{
  await waitForHealth();
  const response=await fetch(base+"/probe",{method:"POST"});
  const raw=await response.text();
  assert.equal(response.ok,true,`D1 parity probe returned HTTP ${response.status}\nbody: ${raw.slice(0,4000)}\nwrangler: ${output.slice(-4000)}`);
  const body=JSON.parse(raw);

  assert.equal(body.runtime,"wrangler-local-d1");

  assert.equal(body.failure.threw,true,"stale finalization precondition must abort D1 batch");
  assert.deepEqual(body.failure.artifacts,{checkpoint:0,event:0,audit:0},"all writes before the guard must roll back atomically");
  assert.equal(body.failure.claim.status,"running","failed D1 batch must leave claim running");
  assert.equal(body.failure.claim.checkpoint_id,null,"failed D1 batch must not attach a checkpoint");
  assert.equal(body.failure.task.next_run_at,"2026-09-26T07:15:00.000Z","failed D1 batch must preserve stale task schedule");

  assert.equal(body.success.threw,false,`valid D1 finalization must succeed: ${body.success.message||""}`);
  assert.deepEqual(body.success.artifacts,{checkpoint:1,event:1,audit:1},"valid D1 batch must commit checkpoint, event and audit exactly once");
  assert.equal(body.success.claim.status,"completed");
  assert.equal(body.success.claim.checkpoint_id,"cp-ok");
  assert.equal(body.success.task.next_run_at,"2026-09-27T06:15:00.000Z");

  assert.equal(body.recoveryRace.fulfilled,1,"exactly one concurrent recovery batch must commit");
  assert.equal(body.recoveryRace.rejected,1,"the losing concurrent recovery batch must fail closed");
  assert.equal(body.recoveryRace.auditCount,1,"concurrent recovery must produce exactly one durable recovery audit event");
  assert.equal(body.recoveryRace.claim.status,"completed");
  assert.equal(body.recoveryRace.claim.checkpoint_id,"cp-race");
  assert.equal(body.recoveryRace.task.next_run_at,"2026-09-27T06:15:00.000Z");

  console.log("v148 Wrangler local D1 batch rollback and commit parity passed");
}finally{
  if(child.exitCode===null)child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve=>child.once("exit",resolve)),
    sleep(3000)
  ]);
  try{fs.rmSync(persist,{recursive:true,force:true})}catch{}
}
