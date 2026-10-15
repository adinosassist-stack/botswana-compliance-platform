import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/js/owner-closure-record-persistence-write-handoff-gate-v359.js',import.meta.url),'utf8');
const lower=source.toLowerCase();

const must=[
  '20261015-owner-closure-record-persistence-write-handoff-gate-v359',
  'Can a future writer enforce every V358 precondition without widening authority?',
  'Review handoff gate',
  'Handoff contract complete for implementation review',
  'Handoff contract complete only after explicit correction',
  'Hold handoff — enforcement gap, binding conflict, replay exposure, or safeguard issue requires owner review',
  'Unknown',
  'Exact V358 envelope binding',
  'Handoff destination identity',
  'Writer enforcement evidence',
  'Atomic target-state/CAS requirement',
  'Atomic idempotency requirement',
  'Binding and authorization re-validation',
  'Abort and failure-semantics contract',
  'Residual obligations, safeguards and Unknown carryover',
  'Handoff gaps, corrections and implementation-review blockers',
  'Authority boundary',
  '/api/business-memory',
  'advisory_write_handoff_gate_no_write',
  'keep the idempotency check and persistence operation in one atomic transaction or equivalent indivisible server-side operation',
  'vague implementation adjectives are not proof',
  'Advisory write-handoff gate only — no writer creation, persistence, decision closure, approval, archival, scheduling, monitoring, key reservation, authorization consumption, decision-change, rollback, or execution authority.'
];
for(const token of must)assert.ok(source.includes(token),`missing ${token}`);

assert.ok(source.includes('role()==="owner"'),'must remain owner-only');
assert.ok(source.includes('clean(snapshot?.state,40).toLowerCase()!=="ready"'),'must require canonical ready state');
assert.equal((source.match(/\/api\/business-memory/g)||[]).length,1,'only one business-memory API reference expected');
assert.ok(source.split('/api/').length===2,'no unrelated API endpoint');
assert.ok(source.includes('const wordingExact=preview===handoff'),'must perform exact wording binding');
assert.ok(source.includes('const sourceIdentityExact=sourceKey===spec.canonicalSourceKey'),'must perform canonical source binding');
assert.ok(source.includes('const previewClear=previewState==="Preview coherent for final human inspection"'),'must bind to coherent V358 state');
assert.ok(source.includes('exactTargetRows(rows,namespace,kind,sourceKey)'),'must inspect exact target identity');
assert.ok(source.includes('idempotencyMatches(rows,idem)'),'must inspect visible replay evidence');
assert.ok(lower.includes('do not infer these controls from vague phrases such as secure, atomic, transactional, safe, validated, or idempotent'),'must reject vague atomicity claims');
assert.ok(lower.includes('if the writer evidence does not explicitly establish a required control, that control is unknown'),'missing controls must remain Unknown');
assert.ok(lower.includes('atomically re-read authoritative exact-target state'),'must require authoritative target re-read');
assert.ok(lower.includes('same transaction or equivalent indivisible operation as persistence'),'must require atomic idempotency/persistence coupling');
assert.ok(lower.includes('fail-closed behavior'),'must require fail-closed failure semantics');
assert.ok(lower.includes('creates no writer, reserves no key, consumes no authorization, grants no write authority, and changes no state'),'must preserve no-authority boundary');

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
  /consumeAuthorization/i,
  /invokeWriter/i,
  /deployWriter/i,
  /createWriter/i
];
for(const pattern of forbidden)assert.ok(!pattern.test(source),`forbidden authority pattern ${pattern}`);

const numericScorePatterns=[
  /\b(?:confidence|probability|risk|urgency|readiness|dependency|reversibility|materiality|completion|success|closure|attribution|fidelity|duplication|authorization|replay|commit|persistence|handoff|atomicity|causal)Score\s*[:=]/i,
  /\bscore\s*[:=]\s*\d/i
];
for(const pattern of numericScorePatterns)assert.ok(!pattern.test(source),`numeric scoring construct not allowed: ${pattern}`);

assert.ok(lower.includes('do not persist the disposition, wording, destination, preview state, authorization reference, idempotency key, writer evidence, residual carryover, handoff result, gap, correction, or blocker'),'must prohibit handoff persistence');
assert.ok(lower.includes('do not create, invoke, configure or deploy a writer'),'must prohibit writer creation/invocation');
assert.ok(lower.includes('do not reserve or consume keys or authorization'),'must prohibit key/authorization consumption');
assert.ok(lower.includes('do not reopen, revise, close, archive, delete, supersede, or overwrite any decision or record'),'must prohibit record mutation');
assert.ok(lower.includes('do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, success, closure, attribution, fidelity, duplication, authorization, replay, commit, persistence, handoff, atomicity, or causal scores'),'must prohibit numeric scores');
assert.ok(lower.includes('never invent authentication, identity assurance, endpoint, http method, database command, transaction mechanism, lock, version, etag, cas token, record id, timestamp, writer identity, deployment state, server capability'),'must forbid invented writer details');

console.log('V359 Owner Closure Record Persistence Write Handoff Gate static boundary: PASS');
