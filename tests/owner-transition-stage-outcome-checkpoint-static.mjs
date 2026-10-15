import fs from 'node:fs';
import assert from 'node:assert/strict';

const file='public/js/owner-transition-stage-outcome-checkpoint-v349.js';
const src=fs.readFileSync(file,'utf8');

assert.match(src,/20261015-owner-transition-stage-outcome-checkpoint-v349/);
assert.match(src,/Owner transition stage outcome checkpoint review/);
assert.match(src,/Review stage outcome/);
assert.match(src,/\(A\) Continue-review/);
assert.match(src,/\(B\) Hold for owner review/);
assert.match(src,/\(C\) Rollback-review warranted/);
assert.match(src,/\(D\) Unknown/);
assert.match(src,/A never authorizes the next stage/);
assert.match(src,/C does not execute rollback/);
assert.match(src,/Checkpoint comparison/);
assert.match(src,/Stop-condition review/);
assert.match(src,/Safeguard and invariant review/);
assert.match(src,/Dependency-change review/);
assert.match(src,/Rollback-criterion review/);
assert.match(src,/Conflict and comparability review/);
assert.match(src,/Residual Unknowns/);
assert.match(src,/Smallest manual next review step/);
assert.match(src,/Continue-review is not approval/);
assert.match(src,/Hold is not cancellation/);
assert.match(src,/Rollback-review warranted is not rollback execution/);
assert.match(src,/Advisory checkpoint review only — no approval, scheduling, monitoring, decision-change, next-stage, rollback, or execution authority\./);

assert.doesNotMatch(src,/\bfetch\s*\(/);
assert.doesNotMatch(src,/XMLHttpRequest/);
assert.doesNotMatch(src,/\bsetInterval\s*\(/);
assert.doesNotMatch(src,/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
assert.doesNotMatch(src,/\/api\/(?:execute|approve|approval|send|schedule|task|payment|filing|experiment|rollback|advance)/i);

const apiRefs=[...src.matchAll(/\/api\/[a-z0-9_\-/]+/gi)].map(match=>match[0]);
assert.deepEqual([...new Set(apiRefs)],['/api/business-memory']);
assert.match(src,/clean\(snapshot\?\.state,40\)\.toLowerCase\(\)!=="ready"/);
assert.match(src,/namespace==="operations"/);
assert.match(src,/owner_decision_note/);
assert.match(src,/owner_experiment_result/);
assert.match(src,/do not persist the transition, stage, observed evidence, or checkpoint result/i);
assert.match(src,/do not create or assign tasks/i);
assert.match(src,/do not schedule/i);
assert.match(src,/do not approve\/reject/i);
assert.match(src,/do not advance the next stage/i);
assert.match(src,/do not execute rollback/i);
assert.match(src,/Do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, checkpoint, or success scores/);
assert.match(src,/do not infer dependencies from semantic similarity/i);
assert.match(src,/Never invent rollback capability or backup state/);
assert.match(src,/different scope, period, population, metric, unit, definition, source, or timing may make evidence non-comparable/i);

console.log('owner transition stage outcome checkpoint static boundary: PASS');