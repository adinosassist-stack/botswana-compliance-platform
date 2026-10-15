import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = 'c4d435793e6aa8f2f9dd0c8e6baa57401c37752b';
const EXPECTED = [
  '.github/workflows/v363-production-writer-adapter-design-review-boundary.yml',
  'tests/owner-closure-record-production-persistence-adapter-static-v362.mjs',
  'tests/owner-closure-record-production-writer-adapter-design-review-v363.mjs',
  'tests/owner-closure-record-production-writer-adapter-design-static-v363.mjs'
].sort();

const changed = execFileSync('git', ['diff', '--name-only', `${BASE}...HEAD`], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed, EXPECTED, 'V363 must change only its two design tests, exact-head workflow, and stack-aware V362 static boundary');
for (const path of changed) {
  assert.ok(path.startsWith('tests/') || path.startsWith('.github/workflows/'), `runtime/production path changed: ${path}`);
}

const design = fs.readFileSync('tests/owner-closure-record-production-writer-adapter-design-review-v363.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/v363-production-writer-adapter-design-review-boundary.yml', 'utf8');
const v362Static = fs.readFileSync('tests/owner-closure-record-production-persistence-adapter-static-v362.mjs', 'utf8');
const combined = `${design}\n${workflow}`;

const forbidden = [
  /\bapp\.(?:post|put|patch|delete)\s*\(/i,
  /\brouter\.(?:post|put|patch|delete)\s*\(/i,
  /express\s*\(/i,
  /listen\s*\(/i,
  /new\s+Pool\s*\(/,
  /new\s+Client\s*\(/,
  /DATABASE_URL/,
  /process\.env/,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /EventSource/,
  /wrangler/i,
  /CREATE\s+TABLE\s+owner_closure/i,
  /ALTER\s+TABLE\s+owner_closure/i
];
for (const pattern of forbidden) assert.ok(!pattern.test(combined), `V363 must remain design-only/non-routable: ${pattern}`);

for (const token of [
  "storageModel: 'immutable_append_only_closure_record'",
  "fingerprintSemantics: 'canonical_target_closure_actor_sha256'",
  "optimisticConcurrency: 'exact_observed_target_version'",
  "auditAtomicity: 'closure_record_and_audit_event_same_transaction_or_fail'",
  "rollbackSemantics: 'zero_partial_effects_on_any_failure'",
  'genericStateEndpointIsClosureWriter: false',
  'routable: false',
  'migrationAdded: false',
  'productionWriterAdded: false',
  'deploymentPathAdded: false',
  'liveClosurePersistenceEnabled: false',
  "authority: 'design_review_only_no_live_writer'",
  'IDEMPOTENCY_CONFLICT',
  'STALE_TARGET_VERSION',
  'TENANT_SCOPE_MISMATCH',
  'WORKSPACE_SCOPE_MISMATCH',
  'V363 defines a production closure-writer adapter design only — it creates no schema, migration, writer, route, endpoint, live closure mutation, decision closure, or execution authority.'
]) assert.ok(design.includes(token), `missing V363 design boundary: ${token}`);

for (const token of [
  "const QUALIFIED_HEAD = 'c4d435793e6aa8f2f9dd0c8e6baa57401c37752b'",
  "execFileSync('git', ['merge-base', '--is-ancestor', QUALIFIED_HEAD, head])",
  'stacked descendant changed runtime/production path'
]) assert.ok(v362Static.includes(token), `missing V362 descendant-safe boundary: ${token}`);

assert.ok(workflow.includes('Checkout exact PR head'), 'V363 workflow must checkout exact PR head');
assert.ok(workflow.includes('Verify exact checkout'), 'V363 workflow must verify exact PR head');
assert.ok(workflow.includes('node-version-file: ".nvmrc"') || workflow.includes("node-version-file: '.nvmrc'"), 'V363 workflow must use pinned Node');
assert.ok(workflow.includes('owner-closure-record-production-writer-adapter-design-review-v363.mjs'), 'V363 workflow must run design review');
assert.ok(workflow.includes('owner-closure-record-production-writer-adapter-design-static-v363.mjs'), 'V363 workflow must run static boundary');
assert.ok(workflow.includes('owner-closure-record-production-persistence-adapter-conformance-v362.mjs'), 'V363 workflow must rerun inherited V362 capability proof');

console.log('V363 Production Closure Writer Adapter Design Review static boundary: PASS');
