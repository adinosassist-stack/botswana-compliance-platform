import fs from 'node:fs';

const wrapper=fs.readFileSync(new URL('../public/js/executive-personalization.js',import.meta.url),'utf8');
const readiness=fs.readFileSync(new URL('../public/js/owner-decision-evidence-readiness-v342.js',import.meta.url),'utf8');

for(const token of [
  'const RELEASE="20261015-owner-decision-evidence-readiness-v342"',
  'function isOwner(){return role()==="owner"}',
  'row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result"',
  'global.ThebeOwnerEvidenceQualityScoring?.qualityProfile?.(record)',
  'global.ThebeOwnerEvidenceConflictDetection?.peersFor?.(record)',
  'global.ThebeOwnerEvidenceResolutionPlan?.resolutionSpec?.(record)',
  '"Ready for review"',
  '"Needs evidence"',
  '"Material conflict unresolved"',
  '"Unknown"',
  'Local state:',
  'Final readiness: not inferred',
  'Return exactly one readiness state from: Ready for review; Needs evidence; Material conflict unresolved; Unknown.',
  'This is readiness for HUMAN REVIEW only, not approval, correctness, safety, or permission to execute.',
  'Material conflict unresolved only when current verified evidence establishes a genuine V340 material conflict',
  'peer count or opposite owner assessments alone never qualify',
  'A V341 resolution plan existing or being possible does not mean the conflict is resolved.',
  'Needs evidence when a known evidence gap could materially affect owner review',
  'Ready for review only when the available verified evidence is sufficient for a human owner to review the decision',
  'Ready for review does NOT mean approve, proceed, correct, safe, low-risk, or authorized.',
  'Unknown when verified context is insufficient to establish any other state.',
  'Strong field completeness alone does not make evidence ready.',
  'Preserve every V339 Unknown and do not manufacture a numeric confidence score.',
  'Re-apply V340 comparability before treating claims as conflicting.',
  "Re-apply V341's minimal-resolution principle when evidence is missing.",
  'Do not persist the readiness state.',
  'authoritative:false',
  'authority:"context_only_no_execution"',
  'global.ThebeOwnerDecisionEvidenceReadiness=Object.freeze({'
]){
  if(!readiness.includes(token))throw new Error('Decision Evidence Readiness contract missing: '+token);
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
  if(readiness.includes(forbidden))throw new Error('Decision Evidence Readiness widened authority or added a mutation/network path: '+forbidden);
}

const apiRefs=[...readiness.matchAll(/"(\/api\/[^"]+)"/g)].map(match=>match[1]);
if(apiRefs.some(path=>path!=="/api/business-memory"))throw new Error('Decision Evidence Readiness may read only existing Business Memory: '+apiRefs.join(','));
if(!readiness.includes('apiJson("/api/business-memory")'))throw new Error('Decision Evidence Readiness must read owner-confirmed experiment evidence through Business Memory.');
if(!readiness.includes('state:"Needs evidence"'))throw new Error('Decision Evidence Readiness must deterministically expose missing recorded evidence as Needs evidence.');
if(!readiness.includes('state:"Unknown"'))throw new Error('Decision Evidence Readiness must remain Unknown when stronger readiness is not verified.');
if(readiness.includes('state:"Ready for review"'))throw new Error('Decision Evidence Readiness must not deterministically infer Ready for review from local fields.');
if(readiness.includes('state:"Material conflict unresolved"'))throw new Error('Decision Evidence Readiness must not deterministically infer material conflict from peer records.');

if(!wrapper.includes('/js/owner-decision-evidence-readiness-v342.js?v=20261015-owner-decision-evidence-readiness-v342')){
  throw new Error('Decision Evidence Readiness loader entry missing.');
}

console.log('Owner Decision Evidence Readiness static checks passed');