import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/js/owner-closure-record-confirmation-review-v355.js',import.meta.url),'utf8');
const must=[
  '20261015-owner-closure-record-confirmation-review-v355',
  'Does the exact closure record wording faithfully reflect the owner’s decision?',
  'Review record wording',
  'Confirmed for owner confirmation consideration',
  'Confirm with explicit corrections',
  'Hold confirmation — verified contradiction or exposure requires owner review',
  'Unknown',
  'confirmation is not approval or persistence',
  'Preserve the owner-selected disposition exactly',
  'Thebe did not choose or change it',
  'Disposition fidelity',
  'Rationale and evidence fidelity',
  'Residual obligations, safeguards and Unknowns fidelity',
  'Conflict and comparability review',
  'Overstatement and omission check',
  'Minimal corrections',
  'Owner confirmation questions',
  'owner_decision_note',
  'owner_experiment_result',
  'namespace==="operations"',
  '/api/business-memory',
  'canonical_state_not_ready',
  'advisory_no_persistence_no_execution',
  'Do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, success, closure, attribution, fidelity, or causal scores.',
  'Advisory record-confirmation review only — no decision closure, approval, archival, persistence, scheduling, monitoring, decision-change, rollback, or execution authority.'
];
for(const token of must)assert.ok(source.includes(token),`missing ${token}`);

assert.ok(source.includes('clean(snapshot?.state,40).toLowerCase()!=="ready"'),'must require canonical ready state');
assert.ok(source.includes('role()==="owner"'),'must remain owner-only');
assert.equal((source.match(/\/api\/business-memory/g)||[]).length,1,'only one business-memory API reference expected');
assert.ok(!source.includes('/api/')||source.split('/api/').length===2,'no unrelated API endpoints');

const forbidden=[
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /setInterval\s*\(/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,
  /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i,
  /createTask/i,
  /assignTask/i,
  /scheduleTask/i,
  /approveDecision/i,
  /closeDecision/i,
  /archiveDecision/i,
  /executeRollback/i
];
for(const pattern of forbidden)assert.ok(!pattern.test(source),`forbidden authority pattern ${pattern}`);

const numericScorePatterns=[
  /\b(?:confidence|probability|risk|urgency|readiness|dependency|reversibility|materiality|completion|success|closure|attribution|fidelity|causal)Score\s*[:=]/i,
  /\bscore\s*[:=]\s*\d/i
];
for(const pattern of numericScorePatterns)assert.ok(!pattern.test(source),`numeric scoring construct not allowed: ${pattern}`);

assert.ok(source.includes('do not persist the selected disposition, draft wording, rationale/evidence basis, residual context, confirmation result, or corrected wording'),'must prohibit persistence');
assert.ok(source.includes('Corrections remain draft wording pending owner review and cannot change the selected disposition'),'corrections must remain human-gated');
assert.ok(source.includes('association from causation'),'must preserve causation discipline');
assert.ok(source.includes('suppress an Unknown'),'must preserve Unknowns');

console.log('V355 Owner Closure Record Confirmation Review static boundary: PASS');
