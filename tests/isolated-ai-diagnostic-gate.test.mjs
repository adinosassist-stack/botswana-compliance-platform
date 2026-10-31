import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyIsolatedAiDiagnostic} from '../scripts/isolated-ai-diagnostic-gate.mjs';
test('fixed isolated AI diagnostic remains fail closed before authorized staging activation',()=>{
 const r=qualifyIsolatedAiDiagnostic('a'.repeat(40));
 assert.equal(r.ok,true);assert.equal(r.execution,'not_authorized');
 assert.equal(r.privateAccess,'not_configured');assert.equal(r.aiStageTiming,'disabled');
 assert.doesNotMatch(JSON.stringify(r),/token|secret|credential|payment/i);
});
test('requires immutable commit SHA',()=>assert.throws(()=>qualifyIsolatedAiDiagnostic('main'),/readiness_exact_sha_required/));
