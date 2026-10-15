import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const resolution=fs.readFileSync(new URL('../public/js/owner-evidence-resolution-plan-v341.js',import.meta.url),'utf8');

for(const token of [
  '/js/owner-evidence-resolution-plan-v341.js?v=20261015-owner-evidence-resolution-plan-v341',
  'const RELEASE="20261015-owner-evidence-resolution-plan-v341"',
  'function isOwner(){return role()==="owner"}',
  'row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result"',
  'global.ThebeOwnerEvidenceConflictDetection?.peersFor?.(record)',
  'global.ThebeOwnerEvidenceQualityScoring?.qualityProfile?.(record)',
  'Conflict must be re-verified',
  'Create the SMALLEST EVIDENCE RESOLUTION PLAN',
  'only if a material conflict remains genuinely unresolved after applying V340 comparability rules',
  'materially conflicts, scope/time difference, not comparable, corroborates, or Unknown',
  'Do not treat different owner assessments as a conflict.',
  'Use current verified business context first.',
  'No resolution plan warranted.',
  'the exact disputed claim',
  'the comparability gap that prevents resolution now',
  'the minimum additional evidence needed',
  'collect no more than is necessary to resolve that claim',
  'required source/provenance characteristics',
  'without inventing access to a source that is not verified available',
  'the exact population/entity scope and unit/definition that must match',
  'owner-defined observation period required',
  'the resolution criterion',
  'the stop condition for evidence gathering',
  'the accountable human reviewer needed to confirm provenance and comparability',
  'the safest reversible next step to obtain or inspect the evidence manually',
  'Prefer existing authoritative records over creating a new experiment.',
  'Do not invent a budget, sample size, numeric threshold, confidence percentage, probability, source availability, observation period, or statistical significance rule.',
  'Do not collect data, browse external systems, request files, contact people, schedule work, create tasks, or launch an experiment.',
  'Do not alter the conflict classification, evidence-quality label, experiment assessment, decision outcome rating, canonical queue, approval state, or any business record.',
  'Planning-only advisory layer.',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'global.ThebeOwnerEvidenceResolutionPlan=Object.freeze({'
]){
  if(!wrapper.includes(token)&&!resolution.includes(token))throw new Error('Evidence Resolution Plan contract missing: '+token);
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
  if(resolution.includes(forbidden))throw new Error('Evidence Resolution Plan widened authority or added a mutation/network path: '+forbidden);
}

const apiRefs=[...resolution.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('Evidence Resolution Plan may read only existing Business Memory: '+apiRefs.join(','));
if(!resolution.includes('apiJson("/api/business-memory")'))throw new Error('Evidence Resolution Plan must read owner-confirmed experiment evidence through Business Memory.');
if(!resolution.includes('authoritative:false')||!resolution.includes('authority:"context_only_no_execution"'))throw new Error('Evidence Resolution Plan must remain non-authoritative context only.');

console.log('Owner Evidence Resolution Plan static checks passed');