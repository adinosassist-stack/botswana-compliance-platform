import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const delta=fs.readFileSync(new URL('../public/js/owner-decision-review-delta-v344.js',import.meta.url),'utf8');

for(const token of [
  'const RELEASE="20261015-owner-decision-review-delta-v344"',
  'function isOwner(){return role()==="owner"}',
  'global.ThebeOwnerFocusStrip?.canonicalSnapshot?.()',
  'global.ThebeOwnerFirstHome?.classify?.(item)',
  'return items.filter(item=>classify(item)==="decision");',
  'global.ThebeOwnerDecisionReviewBrief?.reviewSpec?.(item)',
  'row?.namespace==="operations"&&row?.value?.kind===kind',
  'owner_decision_note',
  'owner_experiment_result',
  'latestMatching(rows,item,"owner_decision_note")',
  'latestMatching(rows,item,"owner_experiment_result")',
  'apiJson("/api/business-memory")',
  'Review changes',
  'This is not automatic monitoring: perform a fresh comparison only for this owner-requested review.',
  'Only call something a change when current verified evidence establishes both the earlier baseline and the current state with compatible scope, metric, unit, population, and observation period.',
  'mark the delta Unknown rather than guessing',
  'Re-apply V340 comparability rules before calling new or resolved conflict.',
  'Separate observed evidence from owner interpretation and do not infer causation.',
  'New supporting evidence',
  'Weakened, stale, or superseded evidence',
  'New conflict, Resolved conflict, Unchanged conflict, or Unknown',
  'Unknowns delta',
  'Safeguard delta',
  'Experiment/result delta',
  'Stronger wording warranted, More cautious wording warranted, Wording unchanged, or Unknown',
  'This wording delta does not approve, reject, or authorize the decision.',
  'No material change verified',
  'No additional review action warranted',
  'Do not create numeric confidence, risk, probability, materiality score, or synthetic evidence score.',
  'Do not persist this delta, create a baseline snapshot, schedule another check, monitor for changes',
  'Advisory delta only — no approval, monitoring, or execution authority.',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'Canonical decision data is not verified, so V344 will not create a change comparison.',
  'reads owner-confirmed decision/result evidence only when you press Review changes',
  'global.ThebeOwnerDecisionReviewDelta=Object.freeze({'
]){
  if(!delta.includes(token))throw new Error('Owner Decision Review Delta contract missing: '+token);
}

for(const forbidden of [
  'method:"POST"',
  'method:"PUT"',
  'method:"PATCH"',
  'method:"DELETE"',
  'fetch(',
  'XMLHttpRequest',
  'setInterval(',
  'REFRESH_MS',
  '/api/ai/operator/attention',
  '/api/business-context/brief',
  '/api/daily-brief',
  '/api/payments/',
  '/execute',
  '/approve',
  '/file',
  '/send'
]){
  if(delta.includes(forbidden))throw new Error('Owner Decision Review Delta widened authority or added monitoring/mutation/network path: '+forbidden);
}

const apiRefs=[...delta.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('Owner Decision Review Delta may read only existing Business Memory: '+apiRefs.join(','));
if(!delta.includes('if(!isOwner()||!item||readBusy)return false;'))throw new Error('Owner Decision Review Delta must remain owner-only and single-read bounded.');
if(!delta.includes('if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;'))throw new Error('Owner Decision Review Delta must fail closed when canonical decision state is not ready.');
if(!delta.includes('reviewButton=button("Review changes",()=>{void reviewDelta(item,reviewButton)},"btn alt")'))throw new Error('Business Memory delta read must remain explicitly owner-triggered.');
if(!delta.includes('No owner-confirmed decision note is available'))throw new Error('Missing decision baseline must remain Unknown.');
if(!delta.includes('No owner-confirmed experiment/result record is available'))throw new Error('Missing result baseline must remain Unknown.');

if(!wrapper.includes('/js/owner-decision-review-delta-v344.js?v=20261015-owner-decision-review-delta-v344')){
  throw new Error('Owner Decision Review Delta loader entry missing.');
}

console.log('Owner Decision Review Delta static checks passed');
