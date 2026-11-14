import test from "node:test";
import assert from "node:assert/strict";
import { readWorkspaceAgentSources, qualifyWorkspaceAgentOffline } from "../scripts/workspace-agent-offline-staging-qualification.mjs";

const baseline=readWorkspaceAgentSources();
const qualifies=(changes={})=>qualifyWorkspaceAgentOffline({...baseline,...changes});

test("merged Workspace Agent is statically safe but NOT deployable",()=>{
  const result=qualifies();
  assert.equal(result.safetyChecksPassed,true,JSON.stringify(result.checks.filter(x=>!x.passed)));
  assert.equal(result.result,"OFFLINE_BASELINE_PASS_NOT_DEPLOYABLE");
  assert.equal(result.readyForStagingDeployment,false);
  assert.equal(result.productionActivationAuthorized,false);
  assert.equal(result.sourceSha256.length,64);
  assert.ok(result.blockers.includes("protected_staging_review_and_activation_approval_required"));
  assert.ok(result.blockers.includes("real_authenticated_staging_browser_and_tenant_isolation_unverified"));
});
test("Node transport parity remains explicitly unqualified",()=>{
  const result=qualifies();
  assert.equal(result.nodeTransport.identityRoutePresent,false);
  assert.equal(result.nodeTransport.tasksRoutePresent,false);
  assert.equal(result.nodeTransport.parityQualified,false);
  assert.ok(result.blockers.includes("node_workspace_agent_identity_task_transport_missing"));
});
test("fails if production Wrangler enables advisory Agent feature flag",()=>{
  const result=qualifies({production:baseline.production+"\nWORKSPACE_AGENT_ADVISORY_SHELL_ENABLED = \"true\"\n"});
  assert.equal(result.safetyChecksPassed,false);
  assert.equal(result.result,"OFFLINE_SAFETY_CHECK_FAILED");
  assert.equal(result.checks[0].passed,false);
});
test("fails if server omits protected owner/manager or exact opt-in",()=>{
  for(const altered of [
    baseline.server.replace('env?.WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED==="true"','true'),
    baseline.server.replace('(probeRole==="owner"||probeRole==="manager")','true')
  ]) {
    const result=qualifies({server:altered});
    assert.equal(result.safetyChecksPassed,false);
    assert.equal(result.readyForStagingDeployment,false);
  }
});
test("fails if Agent API loses owner/manager role gate or GET-only constraint",()=>{
  for(const altered of [
    baseline.worker.replace('roleAllowed(auth, "owner", "manager")','true'),
    baseline.worker.replace('request.method !== "GET"','false')
  ])assert.equal(qualifies({worker:altered}).safetyChecksPassed,false);
});
test("fails if browser coverage stops asserting zero writes",()=>{
  const altered=baseline.browser.replace('state.writes,[]','state.writes,[\"unexpected-write\"]');
  assert.equal(qualifies({browser:altered}).safetyChecksPassed,false);
});
test("fabricated Node route names do not grant parity approval",()=>{
  const result=qualifies({node:baseline.node+'\n"/api/agentic/workspace-identity";\n"/api/agentic/workspace-tasks";'});
  assert.equal(result.nodeTransport.identityRoutePresent,true);
  assert.equal(result.nodeTransport.tasksRoutePresent,true);
  assert.equal(result.nodeTransport.parityQualified,false);
  assert.equal(result.readyForStagingDeployment,false);
});

test("private Node parity candidate is present but never counts as staging qualification",()=>{
 const result=qualifies();
 assert.equal(result.nodeTransport.privateTestCandidatePresent,true);
 assert.equal(result.nodeTransport.parityQualified,false);
 assert.equal(result.readyForStagingDeployment,false);
 assert.equal(result.productionActivationAuthorized,false);
});
test("private Node parity feature gate may not allow production or implicit activation",()=>{
 const result=qualifies({
   nodePrivate:baseline.nodePrivate.replace('appEnv !== "test" || enabled !== true','enabled !== true')
 });
 assert.equal(result.safetyChecksPassed,false);
 assert.ok(result.checks.some(check=>check.code==="node_candidate_registered_only_in_explicit_private_test_env"&&!check.passed));
});
