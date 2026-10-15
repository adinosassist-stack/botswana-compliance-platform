import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const quality=fs.readFileSync(new URL('../public/js/owner-evidence-quality-scoring-v339.js',import.meta.url),'utf8');

for(const token of [
  '/js/owner-evidence-quality-scoring-v339.js?v=20261015-owner-evidence-quality-scoring-v339',
  'const RELEASE="20261015-owner-evidence-quality-scoring-v339"',
  'function isOwner(){return role()==="owner"}',
  'row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result"',
  'Unknown · source named, quality unverified',
  'Weak · source not recorded',
  'Unknown · period recorded, recency unverified',
  'Weak · observation period missing',
  'Unknown · provenance / independence not verified',
  'Unknown · criteria predated review; evidence timing unverified',
  'Score the QUALITY OF THE EVIDENCE',
  'Use current verified business context first.',
  'source quality / provenance',
  'recency of the underlying evidence',
  'completeness for answering the experiment question',
  'independence from the person, system, or process being evaluated',
  'timing relative to the decision and pre-defined criteria',
  'Give the verified reason for every classification.',
  'Do not infer that a named source is trustworthy merely because it is named.',
  'Do not infer independence unless provenance or ownership is verified.',
  'Do not infer evidence recency from recordedAt or review time alone',
  'does not prove source quality, independence, causation, or that evidence was collected before the original decision',
  'If the record or current verified context cannot support a dimension, mark it Unknown.',
  'stronger evidence, mixed quality, weak evidence, or insufficient to score',
  'Do not average Unknown dimensions',
  'do not create a numeric confidence/probability',
  'do not turn the label into approval, blocking, or execution authority',
  'Keep observed facts separate from interpretation',
  'do not convert correlation into causation',
  'Do not alter the experiment assessment, decision outcome rating, canonical queue, or any business record.',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'Only completeness is graded deterministically from recorded fields.',
  'global.ThebeOwnerEvidenceQualityScoring=Object.freeze({'
]){
  if(!wrapper.includes(token)&&!quality.includes(token))throw new Error('Evidence Quality Scoring contract missing: '+token);
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
  if(quality.includes(forbidden))throw new Error('Evidence Quality Scoring widened authority or added a mutation/network path: '+forbidden);
}

const apiRefs=[...quality.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('Evidence Quality Scoring may read only existing Business Memory: '+apiRefs.join(','));
if(!quality.includes('apiJson("/api/business-memory")'))throw new Error('Evidence Quality Scoring must read owner-confirmed experiment evidence through Business Memory.');
if(!quality.includes('if(count===4)return "Strong";')||!quality.includes('if(count>=2)return "Moderate";')||!quality.includes('return "Weak";'))throw new Error('Evidence completeness categorical contract missing.');

console.log('Owner Evidence Quality Scoring static checks passed');