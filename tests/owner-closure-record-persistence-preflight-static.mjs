import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/js/owner-closure-record-persistence-preflight-v356.js',import.meta.url),'utf8');
const lower=source.toLowerCase();

const must=[
  '20261015-owner-closure-record-persistence-preflight-v356',
  'Is the confirmed closure record safe to consider for a separate future save?',
  'Run persistence preflight',
  'Preflight clear for owner persistence consideration',
  'Preflight clear with explicit carryover corrections',
  'Hold persistence — verified duplicate, conflict, identity mismatch, or exposure requires owner review',
  'Unknown',
  'Exact wording equivalence',
  'Intended record identity and destination',
  'Owner-confirmation provenance',
  'Existing-record duplicate check',
  'Conflict and comparability review',
  'Residual obligations, safeguards and Unknown carryover',
  'Closure-state and authority consistency',
  'Required corrections or blockers',
  'Persistence boundary',
  'Owner next-step note',
  '/api/business-memory',
  'canonical_state_not_ready',
  'advisory_no_persistence_no_execution',
  'Any wording change requires renewed V355 confirmation.',
  'Advisory persistence preflight only — no persistence, decision closure, approval, archival, scheduling, monitoring, decision-change, rollback, or execution authority.'
];
for(const token of must)assert.ok(source.includes(token),`missing ${token}`);

assert.ok(source.includes('role()==="owner"'),'must remain owner-only');
assert.ok(source.includes('clean(snapshot?.state,40).toLowerCase()!=="ready"'),'must require canonical ready state');
assert.equal((source.match(/\/api\/business-memory/g)||[]).length,1,'only one business-memory API reference expected');
assert.ok(!source.includes('/api/')||source.split('/api/').length===2,'no unrelated API endpoint');

assert.ok(source.includes('const wordingExact=confirmed===intended'),'must perform deterministic exact-wording equality');
assert.ok(source.includes('const sourceIdentityExact=sourceKey===spec.canonicalSourceKey'),'must perform deterministic canonical source-key identity check');
assert.ok(source.includes('clean(row?.namespace,80)===namespace'),'duplicate check must bind namespace');
assert.ok(source.includes('clean(row?.value?.kind,100)===kind'),'duplicate check must bind record kind');
assert.ok(source.includes('clean(row?.value?.sourceKey,300)===sourceKey'),'duplicate check must bind source key');
assert.ok(lower.includes('preflight is not persistence'),'must state preflight is not persistence');
assert.ok(lower.includes('no write endpoint is called and no state is changed'),'must state no write occurs');
assert.ok(lower.includes('future persistence requires a separate explicit human-authorized write path'),'must keep future write separately human-authorized');
assert.ok(lower.includes('if the wording itself changes, require the changed wording to return through v355 confirmation'),'changed wording must return to V355');
assert.ok(lower.includes('absence is not proof of global absence'),'duplicate absence must not overclaim');

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
  /executeRollback/i
];
for(const pattern of forbidden)assert.ok(!pattern.test(source),`forbidden authority pattern ${pattern}`);

const numericScorePatterns=[
  /\b(?:confidence|probability|risk|urgency|readiness|dependency|reversibility|materiality|completion|success|closure|attribution|fidelity|duplication|causal)Score\s*[:=]/i,
  /\bscore\s*[:=]\s*\d/i
];
for(const pattern of numericScorePatterns)assert.ok(!pattern.test(source),`numeric scoring construct not allowed: ${pattern}`);

assert.ok(lower.includes('do not persist the selected disposition, confirmed wording, intended wording, target identity, confirmation provenance, residual carryover, preflight result, correction, or blocker'),'must prohibit persistence of preflight inputs/results');
assert.ok(lower.includes('do not reopen/revise/close/archive/delete/supersede/overwrite any decision or record'),'must prohibit record mutation');
assert.ok(lower.includes('do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, success, closure, attribution, fidelity, duplication, or causal scores'),'must prohibit numeric scoring');

console.log('V356 Owner Closure Record Persistence Preflight static boundary: PASS');
