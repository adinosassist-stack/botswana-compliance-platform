import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const impact=fs.readFileSync(new URL('../public/js/owner-decision-change-impact-check-v346.js',import.meta.url),'utf8');

for(const token of [
  '/js/owner-decision-change-impact-check-v346.js?v=20261015-owner-decision-change-impact-check-v346',
  'const RELEASE="20261015-owner-decision-change-impact-check-v346"',
  'function isOwner(){return role()==="owner"}',
  'return items.filter(item=>classify(item)==="decision")',
  'owner_decision_note',
  'owner_experiment_result',
  'Proposed change or reversal to assess',
  'This is a manual scenario analysis only.',
  'Do not assume the scenario has been approved, adopted, scheduled, communicated, funded, or executed.',
  'Re-apply V345 reconsideration discipline',
  'Re-apply V344 before/after compatibility and V340 conflict comparability',
  'Preserve V339 Unknowns as Unknown.',
  'Verified affected commitments',
  'Verified dependency map',
  'Reversibility check',
  'Transition hazards',
  'Evidence and safeguard carryover',
  'Conflict and contradiction check',
  'Smallest reversible transition path',
  'Rollback requirements',
  'Decision-change blockers',
  'Owner review questions',
  'Never invent a contract, payment, filing, employee action, customer promise, supplier commitment, system integration, compliance duty, deadline, budget, approval, exposure, or irreversible step.',
  'Do not create numeric confidence, probability, risk, urgency, dependency, reversibility, or materiality scores.',
  'Do not persist the scenario, reopen/revise/close the decision, alter the canonical queue',
  'Advisory impact check only — no decision-change, approval, monitoring, or execution authority.',
  'apiJson("/api/business-memory")',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'global.ThebeOwnerDecisionChangeImpactCheck=Object.freeze({'
]){
  if(!wrapper.includes(token)&&!impact.includes(token))throw new Error('Owner Decision Change Impact Check contract missing: '+token);
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
  '/api/payments/',
  '/execute',
  '/approve',
  '/send',
  '/schedule'
]){
  if(impact.includes(forbidden))throw new Error('V346 widened authority or added a mutation/network path: '+forbidden);
}

const apiRefs=[...impact.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('V346 may read only existing Business Memory: '+apiRefs.join(','));
if(!impact.includes('if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;'))throw new Error('V346 must fail closed when canonical decision data is not ready.');
if(!impact.includes('if(!scenario)'))throw new Error('V346 must require an explicit owner-provided change scenario.');
if(!impact.includes('V346 requires you to describe the proposed change first.'))throw new Error('V346 scenario boundary copy missing.');
if(impact.includes('setInterval('))throw new Error('V346 must not poll business evidence or monitor for changes.');

console.log('Owner Decision Change Impact Check static checks passed');
