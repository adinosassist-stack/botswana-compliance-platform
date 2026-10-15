import fs from 'node:fs';
import assert from 'node:assert/strict';

const file='public/js/owner-transition-completion-evidence-review-v350.js';
const src=fs.readFileSync(file,'utf8');

assert.match(src,/20261015-owner-transition-completion-evidence-review-v350/);
assert.match(src,/Owner transition completion evidence review/);
assert.match(src,/Review completion/);
assert.match(src,/Complete — evidence supports completion/);
assert.match(src,/Incomplete — verified remaining condition/);
assert.match(src,/Blocked — verified blocker prevents completion/);
assert.match(src,/\(D\) Unknown/);
assert.match(src,/Completion is not success/i);
assert.match(src,/Completion definition/);
assert.match(src,/Evidence against each completion condition/);
assert.match(src,/Residual obligations/);
assert.match(src,/Safeguard and invariant status/);
assert.match(src,/Rollback exposure/);
assert.match(src,/Success separation/);
assert.match(src,/Conflict and comparability review/);
assert.match(src,/Residual Unknowns/);
assert.match(src,/Smallest manual next review step/);
assert.match(src,/Advisory completion review only — no closure, approval, scheduling, monitoring, decision-change, rollback, or execution authority\./);

assert.doesNotMatch(src,/\bfetch\s*\(/);
assert.doesNotMatch(src,/XMLHttpRequest/);
assert.doesNotMatch(src,/\bsetInterval\s*\(/);
assert.doesNotMatch(src,/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
assert.doesNotMatch(src,/\/api\/(?:execute|approve|approval|send|schedule|task|payment|filing|experiment|close)/i);

const apiRefs=[...src.matchAll(/\/api\/[a-z0-9_\-/]+/gi)].map(match=>match[0]);
assert.deepEqual([...new Set(apiRefs)],['/api/business-memory']);
assert.match(src,/clean\(snapshot\?\.state,40\)\.toLowerCase\(\)!=="ready"/);
assert.match(src,/namespace==="operations"/);
assert.match(src,/owner_decision_note/);
assert.match(src,/owner_experiment_result/);
assert.match(src,/authoritative:false/);
assert.match(src,/authority:"context_only_no_execution"/);
assert.match(src,/do not persist the transition, completion definition, evidence, or completion state/i);
assert.match(src,/do not reopen\/revise\/close the decision/i);
assert.match(src,/do not create or assign tasks/i);
assert.match(src,/do not schedule/i);
assert.match(src,/do not approve\/reject/i);
assert.match(src,/do not mutate systems/i);
assert.match(src,/Do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, or success scores/);
assert.match(src,/completion alone is never success evidence/i);
assert.match(src,/never invent backup or restoration capability/i);

console.log('owner transition completion evidence review static boundary: PASS');
