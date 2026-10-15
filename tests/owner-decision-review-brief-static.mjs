import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const brief=fs.readFileSync(new URL('../public/js/owner-decision-review-brief-v343.js',import.meta.url),'utf8');

for(const token of [
  'const RELEASE="20261015-owner-decision-review-brief-v343"',
  'function isOwner(){return role()==="owner"}',
  'global.ThebeOwnerFocusStrip?.canonicalSnapshot?.()',
  'global.ThebeOwnerFirstHome?.classify?.(item)',
  'return items.filter(item=>classify(item)==="decision");',
  'row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result"',
  'global.ThebeOwnerRecommendationChallengeMode?.challengeSpec?.(item)',
  'global.ThebeOwnerDecisionPremortem?.premortemSpec?.(item)',
  'global.ThebeOwnerDecisionSafeguardGate?.safeguardSpec?.(item)',
  'global.ThebeOwnerEvidenceQualityScoring?.qualityProfile?.(record)',
  'global.ThebeOwnerEvidenceConflictDetection?.peersFor?.(record)',
  'global.ThebeOwnerDecisionEvidenceReadiness?.readinessSpec?.(record)',
  'global.ThebeOwnerDecisionRecommendationCalibration?.getCalibration?.(sourceType)',
  'Use current verified business context first and re-evaluate every non-persisted analysis fresh',
  'Do not assume an earlier AI pre-mortem, safeguard review, conflict review, resolution plan, or readiness answer is still valid.',
  'Decision in one sentence',
  'Current recommendation',
  'Evidence supporting the recommendation',
  'Evidence against / material conflict',
  'Evidence quality and readiness',
  'Material unknowns',
  'Pre-mortem',
  'Safeguards',
  'Experiment/result interpretation',
  'Smallest next step',
  'Owner review questions',
  'Ready for review, Needs evidence, Material conflict unresolved, or Unknown',
  'Ready for review means suitable for human owner review only, not approval, safety, correctness, or authorization.',
  're-apply V340 comparability rules before calling anything contradictory',
  'Do not manufacture false balance',
  'keep observed evidence separate from owner interpretation and do not infer causation',
  'If no result exists, say unavailable.',
  'No additional evidence action warranted',
  'Historical outcomes are descriptive, not causal proof.',
  'Preserve every Unknown.',
  'Do not create a numeric confidence, risk score, probability, or synthetic evidence score.',
  'Do not persist this brief or readiness state.',
  'Advisory review only — no approval or execution authority.',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'Canonical decision data is not verified, so V343 will not create a decision brief.',
  'global.ThebeOwnerDecisionReviewBrief=Object.freeze({'
]){
  if(!brief.includes(token))throw new Error('Owner Decision Review Brief contract missing: '+token);
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
  if(brief.includes(forbidden))throw new Error('Owner Decision Review Brief widened authority or added a mutation/network path: '+forbidden);
}

const apiRefs=[...brief.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('Owner Decision Review Brief may read only existing Business Memory: '+apiRefs.join(','));
if(!brief.includes('apiJson("/api/business-memory")'))throw new Error('Owner Decision Review Brief must read owner-confirmed experiment evidence through Business Memory.');
if(!brief.includes('state!=="ready"'))throw new Error('Owner Decision Review Brief must fail closed when canonical decision state is not ready.');
if(!brief.includes('resultRows=items.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result")'))throw new Error('Owner Decision Review Brief must limit Business Memory evidence to owner experiment results.');

if(!wrapper.includes('/js/owner-decision-review-brief-v343.js?v=20261015-owner-decision-review-brief-v343')){
  throw new Error('Owner Decision Review Brief loader entry missing.');
}

console.log('Owner Decision Review Brief static checks passed');