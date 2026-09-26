import assert from "node:assert/strict";
import fs from "node:fs";
import {authorityPermitsExecution} from "../cloudflare/src/agent-control-plane.js";
import {isPlatformAdminAuth} from "../cloudflare/src/agentic-control-plane.js";

const migration=fs.readFileSync("cloudflare/migrations/056_v154_agent_control_plane.sql","utf8");
const control=fs.readFileSync("cloudflare/src/agent-control-plane.js","utf8");
const handler=fs.readFileSync("cloudflare/src/agentic-control-plane.js","utf8");
const execution=fs.readFileSync("cloudflare/src/agentic-task-execution.js","utf8");
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");

for(const required of [
  "CREATE TABLE IF NOT EXISTS agent_registry",
  "CREATE TABLE IF NOT EXISTS agent_authority_events",
  "CREATE TABLE IF NOT EXISTS agent_authority_drift_findings",
  "'THEBE-001','thebe','agent'",
  "'SYS-FIN-OBS-001','system_observer','system_observer'",
  "trg_agent_registry_identity_immutable",
  "trg_agent_registry_no_execution_escalation",
  "trg_agent_registry_revoked_terminal"
])assert.ok(migration.includes(required),`missing control-plane contract: ${required}`);

assert.match(migration,/THEBE-001[\s\S]*?'active',1,'platform'/,"Thebe registry must preserve current bounded execution availability without granting it");
assert.match(migration,/SYS-FIN-OBS-001[\s\S]*?'active',0,'platform'/,"observer identity must never be execution capable");
assert.doesNotMatch(migration,/payment\.execute|journal\.post|filing\.submit|employment\.terminate/);

for(const required of [
  "loadCanonicalAgentAuthority",
  "authorityPermitsExecution",
  "evaluateCanonicalAgentDrift",
  "transitionCanonicalAgentAuthority"
])assert.ok(control.includes(required),`missing shared control-plane function: ${required}`);

assert.equal(authorityPermitsExecution({ready:true,agentId:"THEBE-001",actorType:"agent",state:"active",executionCapable:true}),true);
for(const authority of [
  {ready:false,agentId:"THEBE-001",actorType:"agent",state:"active",executionCapable:true},
  {ready:true,agentId:"THEBE-001",actorType:"agent",state:"restricted",executionCapable:true},
  {ready:true,agentId:"THEBE-001",actorType:"agent",state:"suspended",executionCapable:true},
  {ready:true,agentId:"THEBE-001",actorType:"agent",state:"revoked",executionCapable:true},
  {ready:true,agentId:"THEBE-001",actorType:"agent",state:"active",executionCapable:false},
  {ready:true,agentId:"SYS-FIN-OBS-001",actorType:"system_observer",state:"active",executionCapable:true}
])assert.equal(authorityPermitsExecution(authority),false);

assert.equal(isPlatformAdminAuth({PLATFORM_ADMIN_EMAILS:"admin@example.com"},{role:"owner",email:"admin@example.com"}),true);
assert.equal(isPlatformAdminAuth({PLATFORM_ADMIN_EMAILS:"admin@example.com"},{role:"manager",email:"admin@example.com"}),false);
assert.equal(isPlatformAdminAuth({PLATFORM_ADMIN_EMAILS:"admin@example.com"},{role:"owner",email:"other@example.com"}),false);

assert.match(handler,/platform_admin_required/);
assert.match(handler,/originAllowed\(request,env\)/);
assert.match(handler,/csrfAllowed\(request,auth\)/);
assert.match(execution,/authorityPermitsExecution/);
assert.match(execution,/AGENT_EXECUTION_CONTAINED/);
assert.match(execution,/sessionExecutionEnabled\(env,auth\)&&authorityPermitsExecution\(canonicalAuthority\)/);
assert.match(entry,/handleAgenticControlPlaneRequest/);
assert.match(entry,/056_v154_agent_control_plane\.sql/);

console.log("v154 canonical Thebe agent control plane contract passed");
