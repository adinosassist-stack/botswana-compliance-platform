import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const conflict=fs.readFileSync(new URL('../public/js/owner-evidence-conflict-detection-v340.js',import.meta.url),'utf8');

for(const token of [
  '/js/owner-evidence-conflict-detection-v340.js?v=20261015-owner-evidence-conflict-detection-v340',
  'const RELEASE="20261015-owner-evidence-conflict-detection-v340"',
  'function isOwner(){return role()==="owner"}',
  'row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result"',
  'const sameSource=source&&sourceIdentity(candidate)===source;',
  'const sameQuestion=question&&questionIdentity(candidate)===question;',
  'global.ThebeOwnerEvidenceQualityScoring?.qualityProfile?.(record)',
  'Conflict status: not inferred',
  'Review this owner-confirmed experiment evidence for MATERIAL EVIDENCE CONFLICTS before the owner relies on it.',
  'Use current verified business evidence first.',
  'corroborates, materially conflicts, scope/time difference, not comparable, or Unknown',
  'A material conflict requires comparable claims that genuinely disagree.',
  'Do not call evidence contradictory merely because owner assessments differ.',
  'Do not manufacture false balance.',
  'metric/definition, population or entity scope, sample, aggregation level, currency/unit where relevant, and observation period',
  'Different periods, scopes, definitions, populations, samples, or aggregation levels should be classified as scope/time difference or not comparable',
  'Do not infer underlying evidence recency from recordedAt or review timestamps.',
  'Use Evidence Quality Scoring only as non-authoritative context and preserve every Unknown',
  'do not convert Unknown into a score',
  'Do not choose a winner solely because a record is newer, has more text, or has a stronger owner assessment.',
  'provenance, comparability, completeness, independence, or decision relevance',
  'otherwise say the conflict is unresolved',
  'If no verified counterevidence exists, say clearly that no material conflict is currently verified.',
  'Separate observed evidence, owner interpretation, assumptions, and unknowns.',
  'including metric, source/provenance, scope/population, and observation period',
  'Do not create a numeric confidence or probability.',
  'Do not infer causation from correlation.',
  'Do not alter the experiment assessment, evidence-quality label, decision outcome rating, canonical queue, approval state, or any business record.',
  'Read-only advisory review.',
  'global.ThebeOwnerEvidenceConflictDetection=Object.freeze({'
]){
  if(!wrapper.includes(token)&&!conflict.includes(token))throw new Error('Evidence Conflict Detection contract missing: '+token);
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
  if(conflict.includes(forbidden))throw new Error('Evidence Conflict Detection widened authority or added a mutation/network path: '+forbidden);
}

const apiRefs=[...conflict.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('Evidence Conflict Detection may read only existing Business Memory: '+apiRefs.join(','));
if(!conflict.includes('apiJson("/api/business-memory")'))throw new Error('Evidence Conflict Detection must read owner-confirmed experiment evidence through Business Memory.');
if(!conflict.includes('return Boolean(sameSource||sameQuestion);'))throw new Error('Evidence Conflict Detection peer comparison must remain tied to exact source identity or normalized experiment question.');

console.log('Owner Evidence Conflict Detection static checks passed');