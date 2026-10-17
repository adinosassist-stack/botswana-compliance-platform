import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const bf07=readFileSync('.github/workflows/bf07-seal.yml','utf8');

function deployedBaselineQualified({seal,deploy,smoke}){
  return seal===true&&deploy===true&&smoke===true;
}

function completedPhase0Verdict(conclusion){
  return conclusion==='success'||conclusion==='failure';
}

assert.equal(deployedBaselineQualified({seal:true,deploy:true,smoke:true}),true,'sealed + deployed + post-deploy-smoke success must qualify as an artifact-lineage baseline');
assert.equal(deployedBaselineQualified({seal:false,deploy:true,smoke:true}),false,'an unsealed release must never qualify');
assert.equal(deployedBaselineQualified({seal:true,deploy:false,smoke:true}),false,'an undeployed release must never qualify');
assert.equal(deployedBaselineQualified({seal:true,deploy:true,smoke:false}),false,'a deployed release without successful post-deploy smoke must never qualify');

assert.equal(completedPhase0Verdict('success'),true,'a successful Phase 0 audit is a completed post-deploy verdict');
assert.equal(completedPhase0Verdict('failure'),true,'a failed Phase 0 audit is still a completed post-deploy verdict and must not erase an already-proven supply-chain baseline');
assert.equal(completedPhase0Verdict('cancelled'),false,'cancelled Phase 0 audits must not qualify as completed verdicts');
assert.equal(completedPhase0Verdict(null),false,'missing Phase 0 audits must fail closed');

const required=[
  'candidate_bf07_json="$(fetch_workflow_runs bf07-seal.yml "$candidate_sha")"',
  'candidate_deploy_json="$(fetch_workflow_runs deploy-production.yml "$candidate_sha")"',
  'candidate_smoke_json="$(fetch_workflow_runs postdeploy-smoke.yml "$candidate_sha")"',
  "[[ \"$candidate_bf07_success\" == '1' ]] || continue",
  "[[ \"$candidate_deploy_success\" == '1' ]] || continue",
  "[[ \"$candidate_smoke_success\" == '1' ]] || continue",
  'prior_launch_audit_json="$(fetch_workflow_runs production-launch-audit.yml "$previous_release_sha")"',
  'run.get("conclusion") in {"success","failure"}',
  'prior deployed release has no completed automatic Phase 0 launch-audit verdict on main',
  'Prior Phase 0 launch-audit execution confirmed:'
];
for(const fragment of required){
  assert.ok(bf07.includes(fragment),`BF-07 deployed-baseline invariant missing: ${fragment}`);
}

assert.ok(!bf07.includes('candidate_launch_audit_success='),'BF-07 must not select a supply-chain baseline by Phase 0 success');
assert.ok(!bf07.includes('no prior closed production release with a successful automatic launch audit found'),'BF-07 must not deadlock future deployment on a prior post-deploy readiness failure');
assert.ok(!bf07.includes('prior closed release has no successful automatic Phase 0 launch audit on main'),'BF-07 must not require a successful Phase 0 verdict to prove an already-deployed artifact lineage baseline');

const selectionStart=bf07.indexOf("previous_release_sha=''");
const baselineResolved=bf07.indexOf('Prior deployed production release baseline resolved:');
const phase0Check=bf07.indexOf('prior_launch_audit_json="$(fetch_workflow_runs production-launch-audit.yml "$previous_release_sha")"');
assert.ok(selectionStart>=0&&baselineResolved>selectionStart,'BF-07 must resolve the deployed baseline before post-deploy verdict inspection');
assert.ok(phase0Check>baselineResolved,'Phase 0 evidence must be checked only after the sealed/deployed/smoked baseline is selected');

console.log('BF-07 deployed baseline regression: PASS');
