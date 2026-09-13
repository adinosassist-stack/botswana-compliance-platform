import assert from "node:assert/strict";
import fs from "node:fs";
import {AUTONOMY_LEVELS,evaluateDelegatedAuthority,isNeverAutonomousAction,requiredAutonomyLevel} from "../cloudflare/src/delegated-authority.js";
import {AGENT_ACTION_CATALOG} from "../cloudflare/src/agent-policy.js";

assert.equal(AUTONOMY_LEVELS.BOUNDED_EXECUTE,3);
assert.equal(AUTONOMY_LEVELS.HUMAN_ONLY,4);
assert.equal(requiredAutonomyLevel(AGENT_ACTION_CATALOG["business_health.read"]),AUTONOMY_LEVELS.OBSERVE);
assert.equal(requiredAutonomyLevel(AGENT_ACTION_CATALOG["finance_brief.prepare"]),AUTONOMY_LEVELS.PREPARE);
assert.equal(requiredAutonomyLevel(AGENT_ACTION_CATALOG["task.create"]),AUTONOMY_LEVELS.BOUNDED_EXECUTE);
assert.equal(requiredAutonomyLevel(AGENT_ACTION_CATALOG["payment.execute"]),AUTONOMY_LEVELS.HUMAN_ONLY);
assert.equal(isNeverAutonomousAction("payment.execute"),true);
assert.equal(isNeverAutonomousAction("government_filing.submit"),true);
assert.equal(isNeverAutonomousAction("employment.terminate"),true);
assert.equal(isNeverAutonomousAction("task.create"),false);

const controlled=AGENT_ACTION_CATALOG["task.create"];
const external=AGENT_ACTION_CATALOG["reminder.send"];
const highRisk=AGENT_ACTION_CATALOG["payment.execute"];
const baseGrant={
  id:"g1",tenant_id:"t1",agent_key:"management",action_key:"task.create",status:"active",
  max_autonomy_level:3,external_side_effects:0,strong_auth_required:0,human_confirmation_required:1,
  max_daily_actions:10,max_amount_minor:null,shadow_only:1,valid_from:"2026-09-01T00:00:00.000Z",expires_at:"2027-01-01T00:00:00.000Z"
};

let decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"task.create",actionDefinition:controlled,mode:"shadow",now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"delegation_required");

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"task.create",actionDefinition:controlled,delegation:{...baseGrant,status:"paused"},mode:"shadow",now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.code,"delegation_inactive");

decision=evaluateDelegatedAuthority({agentKey:"operations",actionKey:"task.create",actionDefinition:controlled,delegation:baseGrant,mode:"shadow",now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.code,"delegation_agent_mismatch");

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"task.create",actionDefinition:controlled,delegation:baseGrant,mode:"shadow",now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.decision,"review_required");
assert.equal(decision.code,"human_confirmation_required");

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"task.create",actionDefinition:controlled,delegation:baseGrant,mode:"shadow",approvalState:"approved",now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.allowed,true);
assert.equal(decision.decision,"shadow_allow");
assert.equal(decision.executionAllowed,false);

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"task.create",actionDefinition:controlled,delegation:baseGrant,mode:"execute",approvalState:"approved",globalExecutionEnabled:true,now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"shadow_only_grant");

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"task.create",actionDefinition:controlled,delegation:{...baseGrant,max_daily_actions:2},mode:"shadow",approvalState:"approved",dailyActionCount:2,now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.code,"daily_action_limit_reached");

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"task.create",actionDefinition:controlled,delegation:{...baseGrant,max_amount_minor:5000},mode:"shadow",approvalState:"approved",amountMinor:5001,now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.code,"amount_limit_exceeded");

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"task.create",actionDefinition:controlled,delegation:{...baseGrant,expires_at:"2026-09-12T00:00:00.000Z"},mode:"shadow",approvalState:"approved",now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.code,"delegation_expired");

const externalGrant={...baseGrant,action_key:"reminder.send",external_side_effects:0,strong_auth_required:1};
decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"reminder.send",actionDefinition:external,delegation:externalGrant,mode:"shadow",approvalState:"approved",strongAuth:true,now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.code,"external_side_effect_not_delegated");

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"reminder.send",actionDefinition:external,delegation:{...externalGrant,external_side_effects:1},mode:"shadow",approvalState:"approved",strongAuth:false,now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.code,"strong_auth_required");

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"reminder.send",actionDefinition:external,delegation:{...externalGrant,external_side_effects:1},mode:"shadow",approvalState:"approved",strongAuth:true,now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.decision,"shadow_allow");
assert.equal(decision.executionAllowed,false);

decision=evaluateDelegatedAuthority({agentKey:"management",actionKey:"payment.execute",actionDefinition:highRisk,delegation:{...baseGrant,action_key:"payment.execute"},mode:"shadow",approvalState:"approved",strongAuth:true,now:new Date("2026-09-13T00:00:00Z")});
assert.equal(decision.decision,"human_only");
assert.equal(decision.executionAllowed,false);

const migration=fs.readFileSync("cloudflare/migrations/047_v81_delegated_authority.sql","utf8");
for(const table of ["agent_delegations","agent_action_intents","agent_delegation_events"])assert.match(migration,new RegExp("CREATE TABLE IF NOT EXISTS "+table));
assert.match(migration,/max_autonomy_level INTEGER NOT NULL CHECK\(max_autonomy_level BETWEEN 0 AND 3\)/);
assert.match(migration,/shadow_only INTEGER NOT NULL DEFAULT 1 CHECK\(shadow_only=1\)/);
assert.match(migration,/mode TEXT NOT NULL DEFAULT 'shadow' CHECK\(mode='shadow'\)/);
assert.match(migration,/UNIQUE\(tenant_id,idempotency_key\)/);

const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const authority=fs.readFileSync("cloudflare/src/agentic-authority-core.js","utf8");
assert.match(entry,/handleAgenticAuthorityRequest/);
assert.match(authority,/executionEnabled:false/);
assert.match(authority,/shadowOnly:true/);
assert.match(authority,/owner_required/);
assert.match(authority,/idempotency_key_required/);
assert.doesNotMatch(authority,/allow_execute\(/);
assert.doesNotMatch(authority,/fetch\([^)]*https?:\/\//);

console.log("v81 delegated authority shadow-mode tests passed");
