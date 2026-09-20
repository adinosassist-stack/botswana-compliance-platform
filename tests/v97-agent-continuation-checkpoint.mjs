import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AGENT_CONTINUATION_VERSION,
  buildContinuationCheckpoint,
  buildResumeContext,
  verifyContinuationCheckpoint
} from "../cloudflare/src/agent-continuation.js";

assert.equal(AGENT_CONTINUATION_VERSION,"2026-09-20.single-agent-v3");

const observation={
  observedAt:"2026-09-20T07:00:00.000Z",
  finance:{reconciliationExceptions:2,reconciliationExposureMinor:2500,latestReconciliationAt:"2026-09-20T06:00:00.000Z"},
  operations:{pendingWorkflowCount:3,failedWorkflowCount:1,latestSummaryDate:"2026-09-20"},
  compliance:{overdueCount:1,dueWithin14Days:2,nextDueAt:"2026-09-25T00:00:00.000Z"},
  performance:{criticalSignals:1,warningSignals:2},
  verification:{total:2,grounded:2,ungrounded:0,allGrounded:true}
};
const orchestration={
  allowedSourceRefs:["workspace_observation","finance_reconciliation","workflow_jobs"],
  workUnits:[
    {id:"finance-review",capability:"finance",objective:"Review finance exceptions",priority:"high",sourceRefs:["finance_reconciliation"]},
    {id:"ops-review",capability:"operations",objective:"Review failed workflows",priority:"high",sourceRefs:["workflow_jobs"]}
  ]
};
const proposals=[
  {id:"p1",ordinal:1,title:"Review reconciliation exceptions",priority:"high",risk:"low",authority:"recommendation_only",executionPolicy:"not_executable_stage_1",status:"approved",sourceRefs:["finance_reconciliation"]},
  {id:"p2",ordinal:2,title:"Review failed workflows",priority:"high",risk:"low",authority:"recommendation_only",executionPolicy:"not_executable_stage_1",status:"pending",sourceRefs:["workflow_jobs"]}
];

const checkpoint=await buildContinuationCheckpoint({
  runId:"run-1",
  goal:"Protect cash and compliance.",
  summary:"Two bounded follow-ups were identified.",
  confidence:"high",
  observation,
  orchestration,
  proposals,
  createdAt:"2026-09-20T07:01:00.000Z",
  source:"run_checkpoint"
});

assert.match(checkpoint.digest,/^[a-f0-9]{64}$/);
assert.equal(checkpoint.architecture,"single_agent");
assert.equal(checkpoint.agentKey,"thebe");
assert.equal(checkpoint.authority.executionAllowed,false);
assert.equal(checkpoint.authority.approvalReusable,false);
assert.equal(checkpoint.authority.executionAllowed,false);
assert.equal(checkpoint.resumePolicy.freshObservationRequired,true);
assert.equal(checkpoint.resumePolicy.approvalsReusable,false);
assert.equal(checkpoint.resumePolicy.executionAuthorityInherited,false);
assert.ok(checkpoint.workUnits.every(item=>item.independentAuthority===false));
assert.ok(checkpoint.workUnits.every(item=>item.executionAllowed===false));
assert.ok(checkpoint.workUnits.every(item=>item.externalSideEffects===false));

const valid=await verifyContinuationCheckpoint(checkpoint);
assert.equal(valid.valid,true);
assert.equal(valid.code,"checkpoint_valid");

const tamperedAuthority=structuredClone(checkpoint);
tamperedAuthority.authority.executionAllowed=true;
const authorityResult=await verifyContinuationCheckpoint(tamperedAuthority);
assert.equal(authorityResult.valid,false);
assert.equal(authorityResult.code,"checkpoint_authority_invalid");

const tamperedWorker=structuredClone(checkpoint);
tamperedWorker.workUnits[0].independentAuthority=true;
const workerResult=await verifyContinuationCheckpoint(tamperedWorker);
assert.equal(workerResult.valid,false);
assert.equal(workerResult.code,"checkpoint_work_unit_authority_invalid");

const tamperedDigest=structuredClone(checkpoint);
tamperedDigest.summary="Changed after checkpoint";
const digestResult=await verifyContinuationCheckpoint(tamperedDigest);
assert.equal(digestResult.valid,false);
assert.equal(digestResult.code,"checkpoint_digest_mismatch");

const resume=buildResumeContext(checkpoint);
assert.equal(resume.parentRunId,"run-1");
assert.equal(resume.freshObservationRequired,true);
assert.equal(resume.approvalsReusable,false);
assert.equal(resume.executionAuthorityInherited,false);
assert.equal(resume.priorProposals[0].reviewHistory,"historically_approved_not_reusable");
assert.equal("status" in resume.priorProposals[0],false,"raw approval state must not be forwarded as reusable model context");
assert.match(resume.instruction,/Re-observe the workspace/);
assert.match(resume.instruction,/do not expand authority/);

const continuationSource=fs.readFileSync("cloudflare/src/agent-continuation.js","utf8");
assert.doesNotMatch(continuationSource,/\bfetch\s*\(/,"continuation checkpoint code must not make network calls");
assert.doesNotMatch(continuationSource,/evaluateAgentRuntimeGuard|evaluateDelegatedAuthority/,"continuation is not an authority layer");
assert.doesNotMatch(continuationSource,/executeTask|payment\.execute|government_filing\.submit/,"continuation must not execute consequential actions");

const core=fs.readFileSync("cloudflare/src/agentic-core.js","utf8");
assert.match(core,/from "\.\/agent-continuation\.js"/);
assert.match(core,/RUN_CHECKPOINTED/);
assert.match(core,/agentic\/runs\/\(\[\^\/\]\+\)\\\/continuation/);
assert.match(core,/agentic\/runs\/\(\[\^\/\]\+\)\\\/continue/);
assert.match(core,/freshObservationRequired:true/);
assert.match(core,/approvalsReusable:false/);
assert.match(core,/executionAuthorityInherited:false/);
assert.match(core,/goalOverride:loaded\.bundle\.run\.goal/);
assert.match(core,/do not reuse prior approvals/);
assert.match(core,/WHERE id=\? AND tenant_id=\? LIMIT 1/,"run continuation lookup must be tenant scoped");
assert.match(core,/WHERE tenant_id=\? AND run_id=\? AND event_type='RUN_CHECKPOINTED'/,"checkpoint lookup must be tenant and run scoped");
assert.match(core,/env\.DB\.batch\(\[/,"plan, proposals and checkpoint should share one persistence batch");
assert.match(core,/observe_decompose_route_reason_verify_checkpoint_recommend/);

console.log("v97 single-agent continuation checkpoint: PASS");
