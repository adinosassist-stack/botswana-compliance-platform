import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AGENT_ORCHESTRATION_VERSION,
  buildSingleAgentOrchestration,
  verifyOrchestratedProposals
} from "../cloudflare/src/agent-orchestration.js";

assert.match(AGENT_ORCHESTRATION_VERSION,/^2026-09-20\.single-agent-v2$/);

const observation={
  finance:{reconciliationExceptions:2,latestReconciliationAt:"2026-09-19T10:00:00Z"},
  operations:{failedWorkflowCount:1,pendingWorkflowCount:4},
  compliance:{overdueCount:1,dueWithin14Days:3},
  performance:{criticalSignals:1,warningSignals:2}
};
const orchestration=buildSingleAgentOrchestration({goal:"Protect cash and compliance.",observation});

assert.equal(orchestration.architecture,"single_agent");
assert.equal(orchestration.agentKey,"thebe");
assert.equal(orchestration.fanOut.independentAgentIdentity,false);
assert.equal(orchestration.fanOut.independentMemory,false);
assert.equal(orchestration.fanOut.independentAuthority,false);
assert.equal(orchestration.fanOut.executionAllowed,false);
assert.ok(orchestration.workUnits.length>=4);
assert.ok(orchestration.workUnits.every(item=>item.authority==="none"));
assert.ok(orchestration.workUnits.every(item=>item.executionAllowed===false));
assert.ok(orchestration.workUnits.every(item=>item.externalSideEffects===false));
assert.deepEqual(new Set(orchestration.workUnits.map(item=>item.capability)),new Set(["finance","operations","compliance","core"]));
assert.ok(orchestration.allowedSourceRefs.includes("finance_reconciliation"));
assert.ok(orchestration.allowedSourceRefs.includes("workflow_jobs"));
assert.ok(orchestration.allowedSourceRefs.includes("compliance_obligations"));
assert.ok(orchestration.allowedSourceRefs.includes("performance_insights"));

const verified=verifyOrchestratedProposals([
  {
    ordinal:1,title:"Review reconciliation exceptions",reason:"Recorded exception exists.",priority:"high",
    risk:"low",authority:"recommendation_only",executionPolicy:"not_executable_stage_1",
    sourceRefs:["finance_reconciliation","invented_source"]
  },
  {
    ordinal:2,title:"Unverified suggestion",reason:"No source.",priority:"medium",
    risk:"low",authority:"recommendation_only",executionPolicy:"not_executable_stage_1",
    sourceRefs:["invented_source"]
  },
  {
    ordinal:3,title:"Payment action",reason:"Move funds.",priority:"high",
    risk:"high",authority:"human_only",executionPolicy:"prohibited_autonomy",
    sourceRefs:["workspace_observation"]
  }
],orchestration);

assert.deepEqual(verified.proposals[0].sourceRefs,["finance_reconciliation"]);
assert.equal(verified.proposals[0].verification.status,"verified_recommendation");
assert.equal(verified.proposals[0].verification.droppedSourceRefCount,1);
assert.equal(verified.proposals[1].verification.status,"needs_human_review");
assert.equal(verified.proposals[1].verification.grounded,false);
assert.equal(verified.proposals[2].verification.status,"human_only");
assert.equal(verified.proposals[2].verification.executionAllowed,false);
assert.equal(verified.summary.authorityExpanded,false);
assert.equal(verified.summary.executionAllowed,false);

const quiet=buildSingleAgentOrchestration({goal:"Owner brief",observation:{
  finance:{reconciliationExceptions:0,latestReconciliationAt:"2026-09-20T00:00:00Z"},
  operations:{failedWorkflowCount:0,pendingWorkflowCount:0},
  compliance:{overdueCount:0,dueWithin14Days:0},
  performance:{criticalSignals:0,warningSignals:0}
}});
assert.equal(quiet.workUnits.length,1);
assert.equal(quiet.workUnits[0].id,"owner-brief-review");
assert.equal(quiet.workUnits[0].capability,"core");

const core=fs.readFileSync("cloudflare/src/agentic-core.js","utf8");
assert.match(core,/from "\.\/agent-orchestration\.js"/);
assert.match(core,/buildSingleAgentOrchestration\(/);
assert.match(core,/verifyOrchestratedProposals\(/);
assert.doesNotMatch(fs.readFileSync("cloudflare/src/agent-orchestration.js","utf8"),/\bfetch\s*\(/,"orchestration must not gain network authority");
assert.doesNotMatch(fs.readFileSync("cloudflare/src/agent-orchestration.js","utf8"),/evaluateDelegatedAuthority|evaluateAgentRuntimeGuard/,"orchestration is not an authority layer");

console.log("v96 single-agent v2 orchestration: PASS");
