import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/js/owner-closure-record-persistence-writer-spec-review-v360.js',import.meta.url),'utf8');
const lower=source.toLowerCase();

const must=[
  '20261015-owner-closure-record-persistence-writer-spec-review-v360',
  'Is the future writer specification concrete and adversarially testable?',
  'Review writer specification',
  'Specification complete for implementation review',
  'Specification complete only after explicit correction',
  'Hold specification — invariant, atomicity, authorization, test, or failure-semantics gap requires owner review',
  'Unknown',
  'Server-side writer invariants',
  'Atomic transaction and CAS design requirements',
  'Idempotency and retry design requirements',
  'Authorization, provenance and tenant-isolation requirements',
  'Failure, rollback/compensation and acknowledgement semantics',
  'Adversarial test matrix review',
  'Implementation blockers, corrections and residual Unknowns',
  'Authority boundary',
  '/api/business-memory',
  'advisory_writer_spec_review_no_write',
  'duplicate/replayed idempotency key',
  'two concurrent writers racing the same target',
  'stale target version/state',
  'changed wording after authorization',
  'cross-tenant/cross-workspace attempt',
  'false-success response prevention',
  'Advisory writer-specification review only — no writer creation, endpoint exposure, persistence, decision closure, approval, archival, deployment, scheduling, monitoring, key reservation, authorization consumption, decision-change, rollback, or execution authority.'
];
for(const token of must)assert.ok(source.includes(token),`missing ${token}`);

assert.ok(source.includes('role()==="owner"'),'must remain owner-only');
assert.ok(source.includes('clean(snapshot?.state,40).toLowerCase()!=="ready"'),'must require canonical ready state');
assert.equal((source.match(/\/api\/business-memory/g)||[]).length,1,'only one business-memory API reference expected');
assert.ok(source.includes('const wordingExact=handoff===specText'),'must use exact wording equality');
assert.ok(source.includes('const sourceIdentityExact=sourceKey===meta.canonicalSourceKey'),'must bind canonical source identity');
assert.ok(source.includes('exactTargetRows(rows,namespace,kind,sourceKey)'),'must inspect exact target identity');
assert.ok(source.includes('idempotencyMatches(rows,idem)'),'must inspect visible replay evidence');
assert.ok(lower.includes('do not infer implementation completeness from architecture labels, framework names, database brands'),'must reject vague architecture claims');
assert.ok(lower.includes('same transaction or equivalent indivisible operation as persistence'),'must require atomic idempotency with persistence');
assert.ok(lower.includes('truthful durable success acknowledgement only after commit'),'must require truthful success acknowledgement');
assert.ok(lower.includes('never invent authentication, identity assurance, endpoint, route, http method, database command, transaction isolation level'),'must forbid invented writer details');
assert.ok(lower.includes('do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, success, closure, attribution, fidelity, duplication, authorization, replay, commit, persistence, handoff, atomicity, specification, test-coverage, or causal scores'),'must prohibit numeric scores');
assert.ok(lower.includes('do not persist any input or review result'),'must forbid persistence');
assert.ok(lower.includes('do not create/invoke/configure/deploy a writer'),'must forbid writer activation');
assert.ok(lower.includes('do not expose a write endpoint'),'must forbid endpoint exposure');

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
  /deployWriter/i,
  /invokeWriter/i,
  /createWriter/i
];
for(const pattern of forbidden)assert.ok(!pattern.test(source),`forbidden authority pattern ${pattern}`);

const numericScorePatterns=[
  /\b(?:confidence|probability|risk|urgency|readiness|dependency|reversibility|materiality|completion|success|closure|attribution|fidelity|duplication|authorization|replay|commit|persistence|handoff|atomicity|specification|testCoverage|causal)Score\s*[:=]/i,
  /\bscore\s*[:=]\s*\d/i
];
for(const pattern of numericScorePatterns)assert.ok(!pattern.test(source),`numeric scoring construct not allowed: ${pattern}`);

console.log('V360 Owner Closure Record Persistence Writer Specification Review static boundary: PASS');
