import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const plan=fs.readFileSync(new URL('../public/js/owner-decision-transition-plan-v347.js',import.meta.url),'utf8');

for(const token of [
  '/js/owner-decision-transition-plan-v347.js?v=20261015-owner-decision-transition-plan-v347',
  'const RELEASE="20261015-owner-decision-transition-plan-v347"',
  'function isOwner(){return role()==="owner"}',
  'function canonicalSnapshot()',
  'return items.filter(item=>classify(item)==="decision")',
  'row?.namespace==="operations"&&row?.value?.kind===kind',
  'owner_decision_note',
  'owner_experiment_result',
  'Draft an OWNER DECISION TRANSITION PLAN',
  'This is a planning draft for human review only.',
  'Re-apply V346 change-impact discipline',
  'Re-apply V345 reconsideration discipline',
  'Re-apply V344 before/after compatibility and V340 conflict comparability',
  'Preserve V339 Unknowns as Unknown.',
  'Draftable with verified gates',
  'Blocked pending specified evidence',
  'Unknown',
  'Preconditions before any stage',
  'Staged transition draft',
  'explicit owner approval gate before action',
  'evidence/checkpoint required after action',
  'stop condition',
  'rollback gate',
  'irreversible-boundary check',
  'Cross-stage invariants',
  'Rollback architecture',
  'Evidence checkpoints',
  'Hold points',
  'Completion definition',
  'Residual Unknowns',
  'Owner approval sequence',
  'No bulk approval and no implied approval.',
  'Do not persist the scenario or plan',
  'Do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, or materiality scores.',
  'Advisory transition plan only — no decision-change, approval, scheduling, monitoring, or execution authority.',
  'apiJson("/api/business-memory")',
  'Describe the proposed transition before drafting the plan.',
  'V347 requires an explicit transition scenario each time.',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'global.ThebeOwnerDecisionTransitionPlan=Object.freeze({'
]){
  if(!wrapper.includes(token)&&!plan.includes(token))throw new Error('Owner Decision Transition Plan contract missing: '+token);
}

for(const forbidden of [
  'method:"POST"',
  'method:"PUT"',
  'method:"PATCH"',
  'method:"DELETE"',
  'fetch(',
  'XMLHttpRequest',
  '/api/ai/operator/attention',
  '/api/business-context/brief',
  '/api/daily-brief',
  '/api/payments/'
]){
  if(plan.includes(forbidden))throw new Error('Owner Decision Transition Plan widened authority or added a mutation/network path: '+forbidden);
}

const apiRefs=[...plan.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('V347 may read only existing Business Memory: '+apiRefs.join(','));
if(!plan.includes('if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;'))throw new Error('V347 must fail closed when canonical decision data is not ready.');
if(!plan.includes('textarea.maxLength=900;'))throw new Error('V347 transition scenario must remain explicitly bounded.');
if(!plan.includes('The text is not saved.'))throw new Error('V347 must tell the owner the scenario is not persisted.');
if(plan.includes('setInterval('))throw new Error('V347 must not poll business evidence or monitor transitions.');
if(plan.includes('localStorage')||plan.includes('sessionStorage')||plan.includes('indexedDB'))throw new Error('V347 must not persist the transition scenario client-side.');

console.log('Owner Decision Transition Plan static checks passed');
