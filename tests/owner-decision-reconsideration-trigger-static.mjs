import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const trigger=fs.readFileSync(new URL('../public/js/owner-decision-reconsideration-trigger-v345.js',import.meta.url),'utf8');

for(const token of [
  '/js/owner-decision-reconsideration-trigger-v345.js?v=20261015-owner-decision-reconsideration-trigger-v345',
  'const RELEASE="20261015-owner-decision-reconsideration-trigger-v345"',
  'function isOwner(){return role()==="owner"}',
  'function canonicalSnapshot()',
  'return items.filter(item=>classify(item)==="decision")',
  'row?.namespace==="operations"&&row?.value?.kind===kind',
  'owner_decision_note',
  'owner_experiment_result',
  'Assess the OWNER DECISION RECONSIDERATION TRIGGER',
  'This is a manual owner-requested review only, not monitoring and not a state change.',
  'First re-apply the V344 review-delta discipline',
  'Re-apply V340 conflict comparability',
  'Preserve V339 Unknowns as Unknown.',
  'Do not treat a newer timestamp, changed wording, longer note, opposite owner assessment, or different period/scope as a material change by itself.',
  'Owner review warranted now',
  'Owner review warranted when specified evidence arrives',
  'No reconsideration trigger verified',
  'Unknown',
  'Use A only when current verified evidence establishes a material change',
  'Use B only when a specific missing evidence item is the clear blocker',
  'Use C only when a comparable baseline exists and no material change is verified.',
  'Use D when the baseline, current evidence, provenance, scope, period, metric, unit, or comparability is insufficient.',
  'Baseline premise being tested',
  'Verified change candidate',
  'Comparability check',
  'Why the change is or is not material to owner review',
  'Conflict/safeguard/experiment implications',
  'Blocking unknowns',
  'Smallest manual next review step',
  'Do not reopen, revise, close, approve, reject, persist, schedule, monitor, browse external systems, collect data, request files, contact people, create tasks, launch experiments',
  'Do not create numeric confidence, probability, risk, urgency, or materiality scores.',
  'Advisory reconsideration trigger only — no decision, monitoring, approval, or execution authority.',
  'apiJson("/api/business-memory")',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'global.ThebeOwnerDecisionReconsiderationTrigger=Object.freeze({'
]){
  if(!wrapper.includes(token)&&!trigger.includes(token))throw new Error('Owner Decision Reconsideration Trigger contract missing: '+token);
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
  '/file',
  '/send',
  '/schedule'
]){
  if(trigger.includes(forbidden))throw new Error('Owner Decision Reconsideration Trigger widened authority or added a mutation/network path: '+forbidden);
}

const apiRefs=[...trigger.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('V345 may read only existing Business Memory: '+apiRefs.join(','));
if(!trigger.includes('if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;'))throw new Error('V345 must fail closed when canonical decision data is not ready.');
if(!trigger.includes('V345 reads owner-confirmed decision/result evidence only when you press Check reconsideration.'))throw new Error('V345 manual-read boundary copy missing.');
if(trigger.includes('setInterval('))throw new Error('V345 must not poll business evidence or monitor for future changes.');

console.log('Owner Decision Reconsideration Trigger static checks passed');
