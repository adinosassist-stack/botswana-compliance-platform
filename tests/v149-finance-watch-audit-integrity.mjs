import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";

const root=process.cwd();
const wrangler=path.join(root,"node_modules",".bin",process.platform==="win32"?"wrangler.cmd":"wrangler");
const config=path.join(root,"tests","fixtures","wrangler-finance-watch-audit-parity.toml");
assert.equal(fs.existsSync(wrangler),true);
assert.equal(fs.existsSync(config),true);

const persist=fs.mkdtempSync(path.join(os.tmpdir(),"thebe-finance-watch-audit-"));
const port=8795,base=`http://127.0.0.1:${port}`;
let output="";
const child=spawn(wrangler,["dev","--config",config,"--persist-to",persist,"--ip","127.0.0.1","--port",String(port),"--log-level","error"],{cwd:root,env:{...process.env,CI:"true"},stdio:["ignore","pipe","pipe"]});
child.stdout.on("data",x=>{output+=String(x)});child.stderr.on("data",x=>{output+=String(x)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function ready(){
  for(let i=0;i<80;i++){
    if(child.exitCode!==null)throw new Error(`wrangler exited early: ${child.exitCode}\n${output.slice(-5000)}`);
    try{const r=await fetch(base+"/health");if(r.ok)return}catch{}
    await sleep(250);
  }
  throw new Error(`local D1 audit worker did not become ready\n${output.slice(-5000)}`);
}

try{
  await ready();
  const response=await fetch(base+"/probe",{method:"POST"});
  const raw=await response.text();
  assert.equal(response.ok,true,`audit probe HTTP ${response.status}\nbody: ${raw.slice(0,5000)}\nwrangler: ${output.slice(-5000)}`);
  const body=JSON.parse(raw);

  assert.equal(body.first.persisted,true);
  assert.equal(body.first.recovered,true);
  assert.equal(body.first.checkpointId,"cp-1");
  assert.equal(body.first.nextRunAt,"2026-09-27T06:15:00.000Z");

  assert.equal(body.afterFirst.claim.status,"completed");
  assert.equal(body.afterFirst.claim.checkpoint_id,"cp-1");
  assert.equal(body.afterFirst.task.next_run_at,"2026-09-27T06:15:00.000Z");
  assert.equal(body.afterFirst.audits.length,1);
  const audit=body.afterFirst.audits[0];
  assert.equal(Number.isInteger(audit.id),true,"audit_events must use integer autoincrement IDs");
  assert.equal(audit.event_type,"AGENT_FINANCE_OBSERVATION_RECOVERED");
  assert.equal(audit.entity_id,"cp-1");
  assert.equal(audit.tenant_seq,1);
  assert.equal(audit.prev_hash,"GENESIS");
  assert.match(audit.event_hash,/^[0-9a-f]{64}$/);
  assert.equal(audit.integrity_version,1);
  assert.equal(audit.write_source,"finance_watch");
  assert.equal(body.afterFirst.chain.event_count,1);
  assert.equal(body.afterFirst.chain.last_hash,audit.event_hash);

  assert.equal(body.replay.threw,true,"replayed recovery must fail closed on audit identity uniqueness");
  assert.equal(body.afterReplay.audits.length,1,"replay must not create a duplicate recovery audit");
  assert.equal(body.afterReplay.chain.event_count,1,"replay must not advance the audit chain");
  assert.equal(body.afterReplay.chain.last_hash,audit.event_hash);
  assert.equal(body.afterReplay.claim.status,"running","failed replay batch must roll claim update back");
  assert.equal(body.afterReplay.claim.checkpoint_id,null);
  assert.equal(body.afterReplay.task.next_run_at,"2026-09-26T06:15:00.000Z","failed replay batch must roll task schedule update back");

  console.log("v149 Finance Watch sealed audit idempotency and D1 replay rollback passed");
}finally{
  if(child.exitCode===null)child.kill("SIGTERM");
  await Promise.race([new Promise(r=>child.once("exit",r)),sleep(3000)]);
  try{fs.rmSync(persist,{recursive:true,force:true})}catch{}
}
