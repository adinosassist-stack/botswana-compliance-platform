import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/js/owner-closure-record-persistence-commit-preview-v358.js',import.meta.url),'utf8');
const lower=source.toLowerCase();

const must=[
  '20261015-owner-closure-record-persistence-commit-preview-v358',
  'What exactly would the separately authorized write attempt to commit?',
  'Preview commit envelope',
  'Preview coherent for final human inspection',
  'Preview coherent only after explicit carryover correction',
  'Hold preview — binding, target-state, replay, conflict, or exposure requires owner review',
  'Unknown',
  'Proposed write envelope',
  'Exact authorization binding',
  'Current target snapshot',
  'Compare-and-set expectation',
  'Idempotency and replay expectation',
  'Residual obligations, safeguards and Unknown carryover',
  'Expected resulting record state preview',
  'Conflicts, corrections and abort conditions',
  'Future write preconditions',
  'Write authority boundary',
  '/api/business-memory',
  'advisory_commit_preview_no_write',
  'The current-read count and descriptor are descriptive evidence only, not a CAS token or guarantee.',
  'any future writer must atomically reject a reused idempotency key at write time',
  'Advisory persistence commit preview only — no persistence, decision closure, approval, archival, scheduling, monitoring, key reservation, authorization consumption, decision-change, rollback, or execution authority.'
];
for(const token of must)assert.ok(source.includes(token),`missing ${token}`);

assert.ok(source.includes('role()==="owner"'),'must remain owner-only');
assert.ok(source.includes('clean(snapshot?.state,40).toLowerCase()!=="ready"'),'must require canonical ready state');
assert.equal((source.match(/\/api\/business-memory/g)||[]).length,1,'only one business-memory API reference expected');
assert.ok(!source.includes('/api/')||source.split('/api/').length===2,'no unrelated API endpoint');
assert.ok(source.includes('const wordingExact=authorized===proposed'),'must perform deterministic exact-wording binding');
assert.ok(source.includes('const sourceIdentityExact=sourceKey===spec.canonicalSourceKey'),'must perform deterministic source-key binding');
assert.ok(source.includes('exactTargetRows(rows,namespace,kind,sourceKey)'),'must bind target snapshot to exact identity');
assert.ok(source.includes('idempotencyMatches(rows,idem)'),'must inspect visible idempotency reuse');
assert.ok(source.includes('latestTargetDescriptor(targetRows)'),'must produce descriptive latest-target snapshot');
assert.ok(lower.includes('no write, key reservation, authorization consumption, or state change occurs here'),'must state preview-only boundary');
assert.ok(lower.includes('absence in this read is not proof of global uniqueness'),'must avoid global replay claims');
assert.ok(lower.includes('if no authoritative version/etag is available, state that robust cas remains a write-path requirement and is not proven by v358'),'must keep CAS guarantee outside preview');
assert.ok(lower.includes('calls no write endpoint, reserves no key, consumes no authorization, and changes no state'),'must state no write authority');

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
  /deleteDecision/i,
  /persistDecision/i,
  /saveDecision/i,
  /executeRollback/i,
  /reserveIdempotency/i,
  /consumeAuthorization/i
];
for(const pattern of forbidden)assert.ok(!pattern.test(source),`forbidden authority pattern ${pattern}`);

const numericScorePatterns=[
  /\b(?:confidence|probability|risk|urgency|readiness|dependency|reversibility|materiality|completion|success|closure|attribution|fidelity|duplication|authorization|replay|commit|persistence|causal)Score\s*[:=]/i,
  /\bscore\s*[:=]\s*\d/i
];
for(const pattern of numericScorePatterns)assert.ok(!pattern.test(source),`numeric scoring construct not allowed: ${pattern}`);

assert.ok(lower.includes('do not persist the disposition, wording, destination, authorization state, authorization reference, idempotency key, authorization provenance, residual carryover, preview, envelope, precondition, correction, or blocker'),'must prohibit persistence of preview inputs/results');
assert.ok(lower.includes('do not reserve or consume keys or authorization'),'must prohibit reservation/consumption');
assert.ok(lower.includes('do not reopen, revise, close, archive, delete, supersede, or overwrite any decision or record'),'must prohibit record mutation');
assert.ok(lower.includes('do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, success, closure, attribution, fidelity, duplication, authorization, replay, commit, persistence, or causal scores'),'must prohibit numeric scoring');
assert.ok(lower.includes('do not invent an endpoint, http method, database command, record id, timestamp, actor identity, or server-generated field'),'must forbid invented write details');
assert.ok(lower.includes('any failure means abort and return for human review'),'must require abort on failed future preconditions');

console.log('V358 Owner Closure Record Persistence Commit Preview static boundary: PASS');
