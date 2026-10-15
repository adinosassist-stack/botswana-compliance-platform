import fs from 'node:fs';
import assert from 'node:assert/strict';

const file='public/js/owner-transition-outcome-success-review-v351.js';
const src=fs.readFileSync(file,'utf8');

assert.match(src,/20261015-owner-transition-outcome-success-review-v351/);
assert.match(src,/Owner transition outcome success review/);
assert.match(src,/Review outcome/);
assert.match(src,/Outcome success supported/);
assert.match(src,/Outcome shortfall verified/);
assert.match(src,/Mixed outcome — verified benefit and material adverse effect\/trade-off/);
assert.match(src,/\(D\) Unknown/);
assert.match(src,/Completion is not success/i);
assert.match(src,/Correlation is not causation/i);
assert.match(src,/Completion basis/);
assert.match(src,/Owner-defined success criteria/);
assert.match(src,/Evidence against each success criterion/);
assert.match(src,/Attribution and causality review/);
assert.match(src,/Unintended effects and trade-offs/);
assert.match(src,/Durability and time-horizon review/);
assert.match(src,/Residual obligations and exposure/);
assert.match(src,/Conflict and comparability review/);
assert.match(src,/Residual Unknowns/);
assert.match(src,/Smallest manual next review step/);
assert.match(src,/Advisory outcome-success review only — no approval, closure, scheduling, monitoring, decision-change, rollback, causal claim, or execution authority\./);

assert.doesNotMatch(src,/\bfetch\s*\(/);
assert.doesNotMatch(src,/XMLHttpRequest/);
assert.doesNotMatch(src,/\bsetInterval\s*\(/);
assert.doesNotMatch(src,/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
assert.doesNotMatch(src,/\/api\/(?:execute|approve|approval|send|schedule|task|payment|filing|experiment|close|rollback)/i);

const apiRefs=[...src.matchAll(/\/api\/[a-z0-9_\-/]+/gi)].map(match=>match[0]);
assert.deepEqual([...new Set(apiRefs)],['/api/business-memory']);
assert.match(src,/clean\(snapshot\?\.state,40\)\.toLowerCase\(\)!=="ready"/);
assert.match(src,/namespace==="operations"/);
assert.match(src,/owner_decision_note/);
assert.match(src,/owner_experiment_result/);
assert.match(src,/authoritative:false/);
assert.match(src,/authority:"context_only_no_execution"/);
assert.match(src,/do not persist the transition, completion basis, success definition, observed outcome, or success state/i);
assert.match(src,/do not reopen\/revise\/close the decision/i);
assert.match(src,/do not create or assign tasks/i);
assert.match(src,/do not schedule/i);
assert.match(src,/do not approve\/reject/i);
assert.match(src,/do not mutate systems/i);
assert.match(src,/Do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, success, attribution, or causal scores/);
assert.match(src,/temporal sequence, changed wording, before\/after movement, or a single historical outcome does not prove/i);
assert.match(src,/short observation windows cannot prove durable success/i);

console.log('owner transition outcome success review static boundary: PASS');
