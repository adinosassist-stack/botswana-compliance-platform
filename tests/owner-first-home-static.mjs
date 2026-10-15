import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const legacy=fs.readFileSync(new URL('../public/js/executive-personalization-v180.js',import.meta.url),'utf8');
const owner=fs.readFileSync(new URL('../public/js/owner-first-home-v328.js',import.meta.url),'utf8');
const follow=fs.readFileSync(new URL('../public/js/owner-decision-follow-through-v331.js',import.meta.url),'utf8');
const learning=fs.readFileSync(new URL('../public/js/owner-decision-outcome-learning-v332.js',import.meta.url),'utf8');
const calibration=fs.readFileSync(new URL('../public/js/owner-decision-recommendation-calibration-v333.js',import.meta.url),'utf8');
const businessMemory=fs.readFileSync(new URL('../cloudflare/src/business-memory.js',import.meta.url),'utf8');

for(const token of [
  '/js/executive-personalization-v180.js?v=20260929-v180',
  '/js/owner-first-home-v328.js?v=20261015-owner-decision-memory-v330',
  '/js/owner-decision-follow-through-v331.js?v=20261015-owner-decision-follow-through-v331',
  '/js/owner-decision-outcome-learning-v332.js?v=20261015-owner-decision-outcome-learning-v332',
  '/js/owner-decision-recommendation-calibration-v333.js?v=20261015-owner-decision-recommendation-calibration-v333',
  'script.async=false'
]){
  if(!wrapper.includes(token))throw new Error('Owner-first bundle loader missing: '+token);
}

for(const token of [
  'const RELEASE="20261015-owner-decision-memory-v330"',
  'global.ThebeOwnerFocusStrip?.canonicalSnapshot?.()',
  'lane("Act now","action"',
  'lane("Needs your decision","decision"',
  'lane("Waiting / blocked","waiting"',
  'if(isRisk(item)||isOverdue(item))return "action"',
  'if(isDecision(item))return "decision"',
  'if(isBlocked(item))return "waiting"',
  'summaryPill("act now",lanes.action.length)',
  'summaryPill("decide",lanes.decision.length)',
  'summaryPill("waiting",lanes.waiting.length)',
  'Brief me on my verified owner-attention queue.',
  'Do not execute anything.',
  'Thebe will not infer missing obligations or widen authority.',
  'padding-bottom:max(18px,env(safe-area-inset-bottom))',
  'scroll-margin-bottom:180px',
  'if(laneKey==="decision"&&isOwner())',
  'openDecisionDialog(item)',
  'const source=sourceKey(item);',
  'return `decision.${tinyHash(source)}.${slug}`.slice(0,80);',
  'await apiJson("/api/business-memory",{',
  'namespace:"operations"',
  'kind:"owner_decision_note"',
  'authority:"context_only_no_execution"',
  'Domain records remain authoritative.',
  'Decision note saved. No action was executed.'
]){
  if(!owner.includes(token))throw new Error('Owner-first canonical Home contract missing: '+token);
}

if(owner.includes('tinyHash(sourceKey(item))}.${title}'))throw new Error('Decision Memory key must not depend on mutable item title.');

for(const token of [
  'const RELEASE="20261015-owner-decision-follow-through-v331"',
  'function isOwner(){return role()==="owner"}',
  'value?.kind==="owner_decision_note"',
  'value?.status!=="closed"',
  'String(value.followUpAt)<=today',
  'Compare it with the current verified business context.',
  'If a measurable expected outcome was not recorded, say that clearly instead of inventing one.',
  'Treat this note as context only, not execution authority.',
  'Review outcome',
  'Revise decision',
  'Close decision',
  'Keep decision',
  'await persistReview(record,{status:"active"',
  'await persistReview(record,{status:"closed"',
  'authority:"context_only_no_execution"',
  'No action was executed.',
  'if(refreshBusy)return;',
  'if(!record||!dialog||!isOwner()||reviewBusy)return;'
]){
  if(!follow.includes(token))throw new Error('Decision Follow-through contract missing: '+token);
}

for(const forbidden of [
  '/api/ai/operator/attention',
  '/api/business-context/brief',
  '/api/payments/',
  '/execute',
  '/approve'
]){
  if(follow.includes(forbidden))throw new Error('Decision Follow-through widened authority or added an execution path: '+forbidden);
}

for(const token of [
  'const RELEASE="20261015-owner-decision-outcome-learning-v332"',
  'function isOwner(){return role()==="owner"}',
  'row?.namespace==="operations"&&row?.value?.kind==="owner_decision_note"',
  'Boolean(row?.value?.lastReviewedAt)||["kept","closed"].includes',
  'better:"Better outcome"',
  'mixed:"Mixed outcome"',
  'worse:"Worse outcome"',
  'insufficient:"Not enough evidence"',
  '.filter(group=>group.total>=2)',
  'Owner-confirmed descriptive pattern only.',
  'These counts do not prove that a decision caused the later outcome.',
  'do not claim causation from these counts.',
  'Separate evidence, hypotheses, and unknowns.',
  'Do not execute anything or change any business record.',
  'outcomeAssessment:value',
  'outcomeAssessedAt:new Date().toISOString()',
  'authority:"context_only_no_execution"',
  'body:JSON.stringify({namespace:"operations",key:row.key,value:next})',
  'if(!isOwner()||!Object.hasOwn(ASSESSMENTS,value)||!row?.key||writeBusy.has(row.key))return;',
  'Outcome rating could not be saved. No business state was changed.'
]){
  if(!learning.includes(token))throw new Error('Decision Outcome Learning contract missing: '+token);
}

for(const forbidden of [
  '/api/ai/operator/attention',
  '/api/business-context/brief',
  '/api/daily-brief',
  '/api/payments/',
  '/execute',
  '/approve',
  '/file',
  '/send'
]){
  if(learning.includes(forbidden))throw new Error('Decision Outcome Learning widened authority or added an execution path: '+forbidden);
}

for(const token of [
  'const RELEASE="20261015-owner-decision-recommendation-calibration-v333"',
  'const MIN_DIRECTIONAL_SAMPLE=3;',
  'function isOwner(){return role()==="owner"}',
  'row?.namespace==="operations"&&row?.value?.kind==="owner_decision_note"',
  '["better","mixed","worse","insufficient"].includes(value)',
  'if(directional<MIN_DIRECTIONAL_SAMPLE)return "uncalibrated";',
  'return "slightly_supportive";',
  'return "more_cautious";',
  'return "neutral_mixed";',
  'Current verified evidence stays primary.',
  'Historical outcome counts may only adjust recommendation wording strength',
  'never as causal proof',
  'must not override contradictory current evidence',
  'Separate evidence from hypothesis.',
  'Do not execute anything, approve anything, or change any business record.',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'function getCalibration(sourceType)',
  'global.ThebeOwnerDecisionRecommendationCalibration=Object.freeze({',
  'minDirectionalSample:MIN_DIRECTIONAL_SAMPLE'
]){
  if(!calibration.includes(token))throw new Error('Decision Recommendation Calibration contract missing: '+token);
}

for(const forbidden of [
  'method:"POST"',
  'method:"PUT"',
  'method:"PATCH"',
  'method:"DELETE"',
  '/api/ai/operator/attention',
  '/api/business-context/brief',
  '/api/daily-brief',
  '/api/payments/',
  '/execute',
  '/approve',
  '/file',
  '/send'
]){
  if(calibration.includes(forbidden))throw new Error('Decision Recommendation Calibration widened authority or added a mutation path: '+forbidden);
}

for(const token of [
  'if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);',
  'sourceKind:"owner_confirmed"',
  'BUSINESS_MEMORY_CONFIRMED',
  "status='superseded'",
  'authoritative:false'
]){
  if(!businessMemory.includes(token))throw new Error('Decision Memory lost owner-confirmed/audited business-memory boundary: '+token);
}

for(const forbidden of [
  '/api/ai/operator/attention',
  '/api/business-context/brief',
  'fetch("/api/daily-brief',
  'apiJson("/api/daily-brief',
  '/api/payments/',
  '/execute',
  '/approve'
]){
  if(owner.includes(forbidden))throw new Error('Owner-first Home widened authority or added an execution path: '+forbidden);
}

if(!legacy.includes('const RELEASE="20260929-v180"'))throw new Error('Legacy executive personalization was not preserved byte-for-byte as the compatibility layer.');

console.log('Owner Attention + Decision Memory + Follow-through + Outcome Learning + Recommendation Calibration static checks passed');
