import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const legacy=fs.readFileSync(new URL('../public/js/executive-personalization-v180.js',import.meta.url),'utf8');
const owner=fs.readFileSync(new URL('../public/js/owner-first-home-v328.js',import.meta.url),'utf8');
const businessMemory=fs.readFileSync(new URL('../cloudflare/src/business-memory.js',import.meta.url),'utf8');

for(const token of [
  '/js/executive-personalization-v180.js?v=20260929-v180',
  '/js/owner-first-home-v328.js?v=20261015-owner-decision-memory-v330',
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

console.log('Owner Attention + Decision Memory static checks passed');
