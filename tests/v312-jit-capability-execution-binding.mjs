import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AGENT_JIT_EXECUTION_CAPABILITY_VERSION,
  AGENT_JIT_EXECUTION_TOOL_ID,
  issueJitExecutionCapabilityCredential,
  verifyJitExecutionCapabilityCredential
} from "../cloudflare/src/agent-capability-security.js";

const secret="jit-capability-test-secret-0123456789-abcdef";
const now=Date.UTC(2026,9,9,12,0,0);
const permitExpiresAt=new Date(now+5*60*1000).toISOString();
const scope={
  secret,
  tenantId:"tenant-1",
  agentId:"THEBE-001",
  humanUserId:"owner-1",
  requestId:"request-1",
  permitId:"permit-1",
  executionGrantId:"grant-1",
  actionKey:"task.create",
  toolId:AGENT_JIT_EXECUTION_TOOL_ID,
  payloadHash:"a".repeat(64),
  executionEnvId:"env-1",
  permitExpiresAt,
  now
};

const issued=await issueJitExecutionCapabilityCredential(scope);
assert.equal(issued.payload.v,AGENT_JIT_EXECUTION_CAPABILITY_VERSION);
assert.equal(issued.payload.purpose,"jit_task_execution");
assert.equal(issued.payload.maxUses,1);
assert.equal(issued.payload.nonInheritable,true);
assert.equal(issued.payload.reusable,false);
assert.equal(issued.payload.expiresAt,Math.floor(new Date(permitExpiresAt).getTime()/1000));
assert.equal((await verifyJitExecutionCapabilityCredential({...scope,token:issued.token})).valid,true);

for(const [field,value] of [
  ["tenantId","tenant-2"],
  ["humanUserId","owner-2"],
  ["requestId","request-2"],
  ["permitId","permit-2"],
  ["executionGrantId","grant-2"],
  ["payloadHash","b".repeat(64)],
  ["executionEnvId","env-2"]
]){
  const result=await verifyJitExecutionCapabilityCredential({...scope,[field]:value,token:issued.token});
  assert.equal(result.valid,false,`${field} must be bound`);
  assert.equal(result.code,"jit_capability_scope_mismatch");
}

const [encoded,signature]=issued.token.split(".");
const last=signature.at(-1)==="A"?"B":"A";
const tampered=`${encoded}.${signature.slice(0,-1)}${last}`;
assert.equal((await verifyJitExecutionCapabilityCredential({...scope,token:tampered})).valid,false);
assert.equal((await verifyJitExecutionCapabilityCredential({...scope,token:issued.token,now:now+5*60*1000})).code,"jit_capability_expired");
await assert.rejects(()=>issueJitExecutionCapabilityCredential({...scope,secret:"short"}),/jit_capability_secret_required/);
assert.equal((await verifyJitExecutionCapabilityCredential({...scope,secret:"short",token:issued.token})).code,"jit_capability_secret_required");

const wrapper=fs.readFileSync(new URL("../cloudflare/src/jit-capability-governance-entry.js",import.meta.url),"utf8");
assert.match(wrapper,/jit_capability_signing_unavailable/);
assert.match(wrapper,/jit_capability_verification_unavailable/);
assert.match(wrapper,/capabilityToken/);
assert.match(wrapper,/executionEnvId/);
assert.match(wrapper,/authoritativePermit/);
assert.match(wrapper,/verifyJitExecutionCapabilityCredential/);
assert.match(wrapper,/agent_jit_execution_permits/);
assert.doesNotMatch(wrapper,/UPDATE\s+agent_jit_execution_permits/i);
assert.doesNotMatch(wrapper,/DELETE\s+FROM\s+agent_jit_execution_permits/i);
assert.doesNotMatch(wrapper,/INSERT\s+INTO\s+agent_jit_execution_permits/i);
assert.match(wrapper,/return base\.fetch\(request,env,ctx\);/);

const wrangler=fs.readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
assert.match(wrangler,/main = "src\/jit-capability-governance-entry\.js"/);
assert.match(wrangler,/"AGENT_CAPABILITY_SECRET"/);

const executor=fs.readFileSync(new URL("../cloudflare/src/agentic-task-execution.js",import.meta.url),"utf8");
assert.match(executor,/jit_permit_id=\?/);
assert.match(executor,/Number\(permit\.max_uses\)!==1/);
assert.match(executor,/Number\(permit\.use_count\)!==0/);
assert.match(executor,/evaluateAgentRuntimeGuard/);

console.log("v312 JIT capability execution binding checks passed");