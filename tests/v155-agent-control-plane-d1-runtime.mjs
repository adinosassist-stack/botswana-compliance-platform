import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn,execFileSync} from "node:child_process";

const root=process.cwd();
const wrangler=path.join(root,"node_modules",".bin",process.platform==="win32"?"wrangler.cmd":"wrangler");
const config=path.join(root,"tests","fixtures","wrangler-d1-agent-control-plane.toml");
const migration=path.join(root,"cloudflare","migrations","056_v154_agent_control_plane.sql");
for(const file of [wrangler,config,migration])assert.equal(fs.existsSync(file),true,`missing D1 control-plane dependency: ${file}`);

const persist=fs.mkdtempSync(path.join(os.tmpdir(),"thebe-d1-control-plane-"));
const port=8796,base=`http://127.0.0.1:${port}`;let output="";
try{
  execFileSync(wrangler,[
    "d1","execute","thebe-d1-agent-control-plane","--local","--config",config,
    "--persist-to",persist,"--file",migration
  ],{cwd:root,env:{...process.env,CI:"true"},stdio:["ignore","pipe","pipe"]});

  const child=spawn(wrangler,["dev","--config",config,"--persist-to",persist,"--ip","127.0.0.1","--port",String(port),"--log-level","error"],{
    cwd:root,env:{...process.env,CI:"true"},stdio:["ignore","pipe","pipe"]
  });
  child.stdout.on("data",chunk=>{output+=String(chunk)});
  child.stderr.on("data",chunk=>{output+=String(chunk)});
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function waitForHealth(){
    for(let attempt=0;attempt<80;attempt++){
      if(child.exitCode!==null)throw new Error(`wrangler exited before control-plane health check: ${child.exitCode}\n${output.slice(-4000)}`);
      try{const response=await fetch(base+"/health");if(response.ok)return}catch{}
      await sleep(250);
    }
    throw new Error(`control-plane worker did not become ready\n${output.slice(-4000)}`);
  }

  try{
    await waitForHealth();
    const response=await fetch(base+"/probe",{method:"POST"});
    const raw=await response.text();
    assert.equal(response.ok,true,`control-plane probe returned HTTP ${response.status}\nbody: ${raw.slice(0,4000)}\nwrangler: ${output.slice(-4000)}`);
    const body=JSON.parse(raw);
    assert.equal(body.initial.ready,true);
    assert.equal(body.initial.agentId,"THEBE-001");
    assert.equal(body.initialExecutionPermitted,true,"active registry status alone may only preserve, never grant, the separately governed task execution path");
    assert.equal(body.observer.executionCapable,false);
    assert.equal(body.observerExecutionPermitted,false);
    assert.equal(body.initialDrift.drifted,false);
    assert.equal(body.observerEscalationBlocked,true,"observer execution capability escalation must fail in D1");
    assert.equal(body.suspended.ok,true);
    assert.equal(body.suspendedExecutionPermitted,false,"suspension must immediately contain execution");
    assert.equal(body.resumed.ok,true);
    assert.equal(body.degraded.executionCapable,false);
    assert.equal(body.degradedExecutionPermitted,false);
    assert.equal(body.drift.drifted,true,"irreversible execution-capability degradation must surface as canonical drift");
    assert.equal(body.reEscalationBlocked,true,"registry must never raise execution_capable from 0 to 1");
    assert.equal(body.revoked.ok,true);
    assert.equal(body.revive.ok,false);
    assert.equal(body.revive.code,"agent_authority_revoked_terminal");
    assert.ok(body.eventCount>=3,"authority transitions must append durable evidence");
    assert.ok(body.findingCount>=1,"drift evaluation must persist an open finding");
    console.log("v155 D1 canonical agent containment runtime passed");
  }finally{
    if(child.exitCode===null)child.kill("SIGTERM");
    await Promise.race([new Promise(resolve=>child.once("exit",resolve)),sleep(3000)]);
  }
}finally{
  try{fs.rmSync(persist,{recursive:true,force:true})}catch{}
}
