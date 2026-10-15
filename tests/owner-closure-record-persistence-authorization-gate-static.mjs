import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/js/owner-closure-record-persistence-authorization-gate-v357.js',import.meta.url),'utf8');
const lower=source.toLowerCase();

const must=[
  '20261015-owner-closure-record-persistence-authorization-gate-v357',
  'Is the owner authorization bound to this exact record and destination?',
  'Review authorization gate',
  'Authorization clear for separate write consideration',
  'Authorization clear only after explicit carryover correction',
  'Hold authorization — binding, replay, duplicate, conflict, or exposure requires owner review',
  'Unknown',
  'Exact wording binding',
  'Destination binding',
  'Explicit owner authorization declaration',
  'Authorization reference and idempotency evidence',
  'Replay and duplicate check',
  'Residual obligations, safeguards and Unknown carryover',
  'Binding changes requiring re-authorization',
  'Write authority boundary',
  '/api/business-memory',
  'advisory_authorization_gate_no_write',
  'I authorize persistence consideration for this exact wording and destination.',
  'any future write path must re-check the idempotency key atomically at write time before persisting',
  'Advisory persistence-authorization gate only — no persistence, decision closure, approval, archival, scheduling, monitoring, authorization consumption, decision-change, rollback, or execution authority.'
];
for(const token of must)assert.ok(source.includes(token),`missing ${token}`);

assert.ok(source.includes('role()==="owner"'),'must remain owner-only');
assert.ok(source.includes('clean(snapshot?.state,40).toLowerCase()!=="ready"'),'must require canonical ready state');
assert.equal((source.match(/\/api\/business-memory/g)||[]).length,1,'only one business-memory API reference expected');
assert.ok(source.includes('const wordingExact=qualified===authorized'),'must bind exact authorized wording');
assert.ok(source.includes('const sourceIdentityExact=sourceKey===spec.canonicalSourceKey'),'must bind canonical source key');
assert.ok(source.includes('const declarationExact=declaration==="I authorize persistence consideration for this exact wording and destination."'),'must require exact explicit owner declaration');
assert.ok(source.includes('idempotencyMatches(rows,idem)'),'must inspect visible replay/idempotency evidence');
assert.ok(source.includes('authorizationIdempotencyKey||value.idempotencyKey||value.persistenceIdempotencyKey'),'must check known idempotency fields');
assert.ok(lower.includes('same-key absence in this read is not proof of global uniqueness'),'must not overclaim idempotency uniqueness');
assert.ok(lower.includes('v357 calls no write endpoint, consumes no authorization, and changes no state'),'must keep authorization advisory-only');
assert.ok(lower.includes('any wording change must also return through v355 and v356 first'),'changed wording must re-enter prior gates');

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
  /consumeAuthorization/i,
  /executeRollback/i
];
for(const pattern of forbidden)assert.ok(!pattern.test(source),`forbidden authority pattern ${pattern}`);

const numericScorePatterns=[
  /\b(?:confidence|probability|risk|urgency|readiness|dependency|reversibility|materiality|completion|success|closure|attribution|fidelity|duplication|authorization|replay|causal)Score\s*[:=]/i,
  /\bscore\s*[:=]\s*\d/i
];
for(const pattern of numericScorePatterns)assert.ok(!pattern.test(source),`numeric scoring construct not allowed: ${pattern}`);

assert.ok(lower.includes('do not persist the disposition, wording, destination, declaration, authorization reference, idempotency key, residual carryover, state, correction, or blocker'),'must prohibit persistence of authorization inputs/results');
assert.ok(lower.includes('do not consume, revoke, reopen, revise, close, archive, delete, supersede, or overwrite any authorization, decision, or record'),'must prohibit authorization/record mutation');
assert.ok(lower.includes('do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, success, closure, attribution, fidelity, duplication, authorization, replay, or causal scores'),'must prohibit numeric scoring');

console.log('V357 Owner Closure Record Persistence Authorization Gate static boundary: PASS');
