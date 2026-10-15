import fs from 'node:fs';
import assert from 'node:assert/strict';

const file='public/js/owner-decision-closure-readiness-review-v352.js';
const src=fs.readFileSync(file,'utf8');

assert.match(src,/20261015-owner-decision-closure-readiness-review-v352/);
assert.match(src,/Decision closure readiness/);
assert.match(src,/Review closure readiness/);
assert.match(src,/Ready for owner closure consideration/);
assert.match(src,/Not ready — verified remaining condition/);
assert.match(src,/Hold closure — verified exposure requires owner review/);
assert.match(src,/\(D\) Unknown/);
assert.match(src,/A is not closure, approval, archival, cancellation of follow-ups, or release of safeguards/);
assert.match(src,/Owner-defined closure criteria/);
assert.match(src,/Completion evidence basis/);
assert.match(src,/Outcome evidence basis/);
assert.match(src,/Residual obligations/);
assert.match(src,/Follow-up commitments and review horizon/);
assert.match(src,/Safeguard, invariant, rollback and irreversibility exposure/);
assert.match(src,/Conflict and comparability review/);
assert.match(src,/Residual Unknowns/);
assert.match(src,/Smallest manual closure-review step/);
assert.match(src,/Advisory closure-readiness review only — no decision closure, approval, scheduling, monitoring, decision-change, rollback, archival, or execution authority\./);

assert.doesNotMatch(src,/\bfetch\s*\(/);
assert.doesNotMatch(src,/XMLHttpRequest/);
assert.doesNotMatch(src,/\bsetInterval\s*\(/);
assert.doesNotMatch(src,/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
assert.doesNotMatch(src,/\/api\/(?:execute|approve|approval|send|schedule|task|payment|filing|experiment|close|archive)/i);
assert.doesNotMatch(src,/localStorage|sessionStorage|indexedDB/);

const apiRefs=[...src.matchAll(/\/api\/[a-z0-9_\-/]+/gi)].map(match=>match[0]);
assert.deepEqual([...new Set(apiRefs)],['/api/business-memory']);
assert.match(src,/clean\(snapshot\?\.state,40\)\.toLowerCase\(\)!=="ready"/);
assert.match(src,/namespace==="operations"/);
assert.match(src,/owner_decision_note/);
assert.match(src,/owner_experiment_result/);
assert.match(src,/authoritative:false/);
assert.match(src,/authority:"context_only_no_execution"/);
assert.match(src,/Re-apply V351 outcome-success discipline/);
assert.match(src,/V350 completion discipline/);
assert.match(src,/V340 conflict comparability/);
assert.match(src,/preserve V339 Unknowns as Unknown/);
assert.match(src,/do not persist the closure candidate, criteria, evidence, residual context, or readiness state/i);
assert.match(src,/do not reopen\/revise\/close\/archive the decision/i);
assert.match(src,/do not create or assign tasks/i);
assert.match(src,/do not schedule/i);
assert.match(src,/do not approve\/reject/i);
assert.match(src,/do not mutate systems/i);
assert.match(src,/Do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, materiality, completion, success, closure, attribution, or causal scores/);
assert.match(src,/Ready for owner closure consideration is not closure/);
assert.match(src,/never invent backup or rollback capability/i);
assert.match(src,/ThebeOwnerDecisionClosureReadinessReview/);

console.log('owner decision closure readiness review static boundary: PASS');
