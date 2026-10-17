import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const legacy=fs.readFileSync(new URL('../public/js/executive-personalization-v180.js',import.meta.url),'utf8');
const owner=fs.readFileSync(new URL('../public/js/owner-first-home-v328.js',import.meta.url),'utf8');

for(const token of [
  '/js/executive-personalization-v180.js?v=20260929-v180',
  '/js/owner-first-home-v328.js?v=20261015-owner-attention-v329',
  'script.async=false'
]){
  if(!wrapper.includes(token))throw new Error('Owner-first bundle loader missing: '+token);
}

for(const token of [
  'const RELEASE="20261015-owner-attention-v329"',
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
  'scroll-margin-bottom:180px'
]){
  if(!owner.includes(token))throw new Error('Owner-first canonical Home contract missing: '+token);
}

for(const forbidden of [
  '/api/ai/operator/attention',
  '/api/business-context/brief',
  'fetch("/api/daily-brief',
  'apiJson("/api/daily-brief'
]){
  if(owner.includes(forbidden))throw new Error('Owner-first Home widened canonical authority with a second fetch: '+forbidden);
}

if(!legacy.includes('const RELEASE="20260929-v180"'))throw new Error('Legacy executive personalization was not preserved byte-for-byte as the compatibility layer.');

console.log('Owner-first canonical Home static checks passed');
