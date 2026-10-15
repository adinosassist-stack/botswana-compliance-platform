import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = 'b6769aa1d9bcd1ec5c73fa15d447d86e5b388695';
const EXPECTED = [
  '.github/workflows/v364-production-writer-adapter-implementation-readiness-boundary.yml',
  'tests/owner-closure-record-production-writer-adapter-design-static-v363.mjs',
  'tests/owner-closure-record-production-writer-adapter-implementation-readiness-v364.mjs',
  'tests/owner-closure-record-production-writer-adapter-implementation-readiness-static-v364.mjs'
].sort();

const changed = execFileSync('git', ['diff', '--name-only', `${BASE}...HEAD`], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed, EXPECTED, 'V364 must change only its readiness tests/workflow and stack-aware V363 static boundary');
for (const path of changed) {
  assert.ok(path.startsWith('tests/') || path.startsWith('.github/workflows/'), `runtime/production path changed: ${path}`);
}

const readiness = fs.readFileSync('tests/owner-closure-record-production-writer-adapter-implementation-readiness-v364.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/v364-production-writer-adapter-implementation-readiness-boundary.yml', 'utf8');
const v363Static = fs.readFileSync('tests/owner-closure-record-production-writer-adapter-design-static-v363.mjs', 'utf8');
const combined = `${readiness}\n${workflow}`;

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
for (const pattern of forbidden) assert.ok(!pattern.test(combined), `V364 must remain readiness-only/non-routable: ${pattern}`);

for (const token of [
  "state: 'ready_for_separate_implementation_branch'",
  "inheritedDesign: 'v363_frozen_design_contract_verified'",
  "inheritedProductionPrimitives: 'v362_capabilities_verified'",
  'currentProductionClosureWriter: false',
  'currentProductionClosureSchema: false',
  'currentProductionClosureRoute: false',
  'implementationMustRemainSeparate: true',
  'dedicated_append_only_closure_record_schema',
  'database_enforced_idempotency_uniqueness',
  'server_authoritative_tenant_workspace_actor_provenance',
  'write_time_human_authorization_binding_revalidation',
  'exact_target_reread_and_observed_version_compare',
  'canonical_server_side_request_fingerprint',
  'closure_record_and_audit_event_same_transaction',
  'zero_partial_effects_on_failure',
  'truthful_success_only_after_commit',
  'runtime_adversarial_replay_cas_scope_and_rollback_tests',
  'route_exposure_only_after_writer_and_migration_proofs',
  'deployment_disabled_until_protected_review_and_merge_governance',
  'AUTHORIZATION_BINDING_MISMATCH',
  'AUTHORIZATION_STALE_OR_REVOKED',
  'PERSISTENCE_TRANSACTION_ABORTED',
  'migrationAdded: false',
  'productionWriterAdded: false',
  'routeAdded: false',
  'deploymentPathAdded: false',
  'liveClosurePersistenceEnabled: false',
  "authority: 'implementation_readiness_only_no_live_writer'",
  'V364 establishes implementation-readiness evidence only — it creates no closure-record schema, migration, writer, route, endpoint, deployment path, live closure mutation, decision closure, or execution authority.'
]) assert.ok(readiness.includes(token), `missing V364 readiness boundary: ${token}`);

for (const token of [
  "const QUALIFIED_HEAD = 'b6769aa1d9bcd1ec5c73fa15d447d86e5b388695'",
  "execFileSync('git', ['merge-base', '--is-ancestor', QUALIFIED_HEAD, head])",
  'stacked V363 descendant changed runtime/production path'
]) assert.ok(v363Static.includes(token), `missing V363 descendant-safe boundary: ${token}`);

assert.ok(workflow.includes('Checkout exact PR head'), 'V364 workflow must checkout exact PR head');
assert.ok(workflow.includes('Verify exact checkout'), 'V364 workflow must verify exact PR head');
assert.ok(workflow.includes('node-version-file: ".nvmrc"') || workflow.includes("node-version-file: '.nvmrc'"), 'V364 workflow must use pinned Node');
assert.ok(workflow.includes('owner-closure-record-production-writer-adapter-implementation-readiness-v364.mjs'), 'V364 workflow must run readiness review');
assert.ok(workflow.includes('owner-closure-record-production-writer-adapter-implementation-readiness-static-v364.mjs'), 'V364 workflow must run static boundary');
assert.ok(workflow.includes('owner-closure-record-production-writer-adapter-design-review-v363.mjs'), 'V364 workflow must rerun inherited V363 design proof');
assert.ok(workflow.includes('owner-closure-record-production-persistence-adapter-conformance-v362.mjs'), 'V364 workflow must rerun inherited V362 capability proof');

console.log('V364 Production Closure Writer Adapter Implementation Readiness static boundary: PASS');
