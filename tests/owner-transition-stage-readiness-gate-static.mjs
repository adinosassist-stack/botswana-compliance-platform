import fs from 'node:fs';
import assert from 'node:assert/strict';

const file='public/js/owner-transition-stage-readiness-gate-v348.js';
const src=fs.readFileSync(file,'utf8');

assert.match(src,/20261015-owner-transition-stage-readiness-gate-v348/);
assert.match(src,/Owner transition stage readiness gate/);
assert.match(src,/Check stage readiness/);
assert.match(src,/Ready for owner approval consideration/);
assert.match(src,/Not ready — verified blocker/);
assert.match(src,/Ready only after specified evidence or condition/);
assert.match(src,/\(D\) Unknown/);
assert.match(src,/readiness is not approval/i);
assert.match(src,/every stage requires separate owner approval/i);
assert.match(src,/verified prerequisites/i);
assert.match(src,/Evidence checkpoint readiness/);
assert.match(src,/Rollback gate/);
assert.match(src,/Irreversible-boundary check/);
assert.match(src,/Safeguard and invariant check/);
assert.match(src,/Hold\/stop conditions/);
assert.match(src,/Blocking evidence or condition/);
assert.match(src,/Advisory stage-readiness gate only — no approval, scheduling, monitoring, decision-change, or execution authority\./);

assert.doesNotMatch(src,/\bfetch\s*\(/);
assert.doesNotMatch(src,/XMLHttpRequest/);
assert.doesNotMatch(src,/\bsetInterval\s*\(/);
assert.doesNotMatch(src,/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
assert.doesNotMatch(src,/\/api\/(?:execute|approve|approval|send|schedule|task|payment|filing|experiment)/i);

const apiRefs=[...src.matchAll(/\/api\/[a-z0-9_\-/]+/gi)].map(match=>match[0]);
assert.deepEqual([...new Set(apiRefs)],['/api/business-memory']);
assert.match(src,/clean\(snapshot\?\.state,40\)\.toLowerCase\(\)!=="ready"/);
assert.match(src,/namespace==="operations"/);
assert.match(src,/owner_decision_note/);
assert.match(src,/owner_experiment_result/);
assert.match(src,/do not persist the scenario, stage, or readiness result/i);
assert.match(src,/do not create or assign tasks/i);
assert.match(src,/do not schedule/i);
assert.match(src,/do not approve\/reject/i);
assert.match(src,/do not mutate systems or execute anything/i);
assert.match(src,/Do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, or materiality scores/);
assert.match(src,/do not infer dependencies from semantic similarity/i);
assert.match(src,/never invent backup or restoration capability/i);

console.log('owner transition stage readiness gate static boundary: PASS');