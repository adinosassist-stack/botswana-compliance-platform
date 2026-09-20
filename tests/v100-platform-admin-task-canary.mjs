import assert from "node:assert/strict";
import fs from "node:fs";
import {__agenticTaskExecutionTest} from "../cloudflare/src/agentic-task-execution.js";

const {
  executionMode,
  platformAdminEmails,
  sessionExecutionEnabled,
  globalExecutionEnabled,
  runtimeKillSwitch
}=__agenticTaskExecutionTest;

assert.equal(executionMode({}),"off");
assert.equal(executionMode({AGENT_BOUNDED_TASK_EXECUTION_MODE:"off"}),"off");
assert.equal(executionMode({AGENT_BOUNDED_TASK_EXECUTION_MODE:"platform_admin_canary"}),"platform_admin_canary");
assert.equal(executionMode({AGENT_BOUNDED_TASK_EXECUTION_MODE:"global"}),"global");
assert.equal(executionMode({AGENT_BOUNDED_TASK_EXECUTION_MODE:"unexpected"}),"off");
assert.equal(executionMode({AGENT_BOUNDED_TASK_EXECUTION_ENABLED:"1",AGENT_BOUNDED_TASK_EXECUTION_MODE:"off"}),"global");
assert.equal(globalExecutionEnabled({AGENT_BOUNDED_TASK_EXECUTION_MODE:"platform_admin_canary"}),false);
assert.equal(globalExecutionEnabled({AGENT_BOUNDED_TASK_EXECUTION_MODE:"global"}),true);
assert.equal(runtimeKillSwitch({AGENT_RUNTIME_KILL_SWITCH:"true"}),true);

const env={
  AGENT_BOUNDED_TASK_EXECUTION_MODE:"platform_admin_canary",
  PLATFORM_ADMIN_EMAILS:"owner@example.com, second@example.com"
};
assert.deepEqual([...platformAdminEmails(env)],["owner@example.com","second@example.com"]);
assert.equal(sessionExecutionEnabled(env,{role:"owner",email:"owner@example.com"}),true);
assert.equal(sessionExecutionEnabled(env,{role:"owner",email:"OWNER@EXAMPLE.COM"}),true);
assert.equal(sessionExecutionEnabled(env,{role:"manager",email:"owner@example.com"}),false);
assert.equal(sessionExecutionEnabled(env,{role:"owner",email:"other@example.com"}),false);
assert.equal(sessionExecutionEnabled({...env,AGENT_BOUNDED_TASK_EXECUTION_MODE:"off"},{role:"owner",email:"owner@example.com"}),false);
assert.equal(sessionExecutionEnabled({AGENT_BOUNDED_TASK_EXECUTION_MODE:"global"},{role:"manager",email:"other@example.com"}),true);

const backend=fs.readFileSync("cloudflare/src/agentic-task-execution.js","utf8");
assert.match(backend,/globalExecutionEnabled:sessionExecutionEnabled\(env,auth\)/);
assert.match(backend,/platform_admin_canary_is_owner_only/);
assert.match(backend,/PLATFORM_ADMIN_EMAILS/);
assert.match(backend,/executionMode:executionMode\(env\)/);
assert.match(backend,/AGENT_TASK_EXECUTION_DENIED/);
assert.match(backend,/AGENT_TASK_EXECUTED/);
assert.doesNotMatch(backend,/payment\.execute/);
assert.doesNotMatch(backend,/government_filing\.submit/);

const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");
assert.match(wrangler,/AGENT_BOUNDED_TASK_EXECUTION_MODE = "platform_admin_canary"/);
assert.doesNotMatch(wrangler,/AGENT_BOUNDED_TASK_EXECUTION_MODE = "global"/);

const preflight=fs.readFileSync("cloudflare/preflight-production.sh","utf8");
assert.match(preflight,/AGENT_BOUNDED_TASK_EXECUTION_MODE/);
assert.match(preflight,/platform_admin_canary/);
assert.match(preflight,/reviewed platform-admin canary/);

const ui=fs.readFileSync("public/js/owner-command-centre.js","utf8");
assert.match(ui,/sessionExecutionEnabled===true/);
assert.match(ui,/Platform-admin canary · ON/);
assert.match(ui,/Platform-admin canary · restricted/);
assert.match(ui,/Only authenticated platform-admin owners can execute during this canary/);
assert.doesNotMatch(ui,/AGENT_BOUNDED_TASK_EXECUTION_MODE\s*=/);

console.log("v100 platform-admin bounded task canary: PASS");
