import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = (path) => fs.readFileSync(path, 'utf8');
const V364_QUALIFIED_HEAD = '5aefd271b40563df098bcc9451de2461a124363c';
const APPROVED_V365_MIGRATION = 'db/migrations/033_v365_owner_closure_records.sql';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const v363 = read('tests/owner-closure-record-production-writer-adapter-design-review-v363.mjs');
const v362 = read('tests/owner-closure-record-production-persistence-adapter-conformance-v362.mjs');
const server = read('server/server.js');
const migrationDir = 'db/migrations';
const migrationFiles = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
const migrations = migrationFiles.map((name) => read(`${migrationDir}/${name}`)).join('\n');

const requireAll = (source, tokens, label) => {
  for (const token of tokens) assert.ok(source.includes(token), `${label} missing ${token}`);
};

const AUTHORITY = 'V364 establishes implementation-readiness evidence only — it creates no closure-record schema, migration, writer, route, endpoint, deployment path, live closure mutation, decision closure, or execution authority.';

const readiness = Object.freeze({
  release: '20261015-owner-closure-record-production-writer-adapter-implementation-readiness-v364',
  state: 'ready_for_separate_implementation_branch',
  inheritedDesign: 'v363_frozen_design_contract_verified',
  inheritedProductionPrimitives: 'v362_capabilities_verified',
  currentProductionClosureWriter: false,
  currentProductionClosureSchema: false,
  currentProductionClosureRoute: false,
  implementationMustRemainSeparate: true,
  implementationPrerequisites: Object.freeze([
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
    'deployment_disabled_until_protected_review_and_merge_governance'
  ]),
  requiredFailureSemantics: Object.freeze([
    'IDEMPOTENCY_CONFLICT',
    'STALE_TARGET_VERSION',
    'TENANT_SCOPE_MISMATCH',
    'WORKSPACE_SCOPE_MISMATCH',
    'AUTHORIZATION_BINDING_MISMATCH',
    'AUTHORIZATION_STALE_OR_REVOKED',
    'PERSISTENCE_TRANSACTION_ABORTED'
  ]),
  implementationOrder: Object.freeze([
    'add_dedicated_schema_and_constraints',
    'add_non_routable_server_writer',
    'prove_writer_runtime_against_postgres',
    'prove_replay_cas_scope_audit_and_rollback',
    'add_dedicated_route_only_after_writer_proofs',
    'keep_live_deployment_disabled',
    'complete_protected_independent_review_before_any_promotion'
  ]),
  migrationAdded: false,
  productionWriterAdded: false,
  routeAdded: false,
  deploymentPathAdded: false,
  liveClosurePersistenceEnabled: false,
  authority: 'implementation_readiness_only_no_live_writer'
});

// V363 remains the frozen adapter design contract V364 is assessing for implementation readiness.
requireAll(v363, [
  "storageModel: 'immutable_append_only_closure_record'",
  "fingerprintSemantics: 'canonical_target_closure_actor_sha256'",
  "optimisticConcurrency: 'exact_observed_target_version'",
  "idempotencyReplay: 'same_key_same_fingerprint_returns_existing_record'",
  "idempotencyConflict: 'same_key_changed_fingerprint_fails_closed'",
  "auditAtomicity: 'closure_record_and_audit_event_same_transaction_or_fail'",
  "rollbackSemantics: 'zero_partial_effects_on_any_failure'",
  "authoritativeScope: Object.freeze(['tenantId', 'workspaceId', 'actorUserId'])",
  "serverGenerated: Object.freeze(['recordId', 'recordVersion', 'recordedAt', 'auditEventId'])",
  'genericStateEndpointIsClosureWriter: false',
  'routable: false',
  'migrationAdded: false',
  'productionWriterAdded: false',
  'deploymentPathAdded: false',
  'liveClosurePersistenceEnabled: false',
  "authority: 'design_review_only_no_live_writer'"
], 'V363 frozen design');

// V362 must still prove the actual repository has the transaction/CAS/provenance/replay/rollback primitives needed by a future implementation.
requireAll(v362, [
  "transactionCapability: 'verified'",
  "casCapability: 'verified'",
  "tenantIsolationCapability: 'verified'",
  "serverProvenanceCapability: 'verified'",
  "singleConsumptionReplayCapability: 'verified'",
  "rollbackCapability: 'verified'",
  'closureWriterRoutable: false',
  'closureWriterDeployed: false',
  'liveClosurePersistenceEnabled: false'
], 'V362 production primitive evidence');

const closureSchemaPresent = /create\s+table\s+(?:if\s+not\s+exists\s+)?owner_closure/i.test(migrations)
  || /alter\s+table\s+owner_closure/i.test(migrations);

// Freeze V364's original pre-schema claim at its exact qualified head. Approved descendants may add only
// the specifically named V365 schema foundation while still having no production writer or route.
assert.ok(!server.includes('owner_closure_record'), 'V364/V365 stack expects no production owner_closure_record writer');
assert.ok(!server.includes('/api/owner-closure'), 'V364/V365 stack expects no production owner-closure route');
if (head === V364_QUALIFIED_HEAD) {
  assert.equal(closureSchemaPresent, false, 'frozen V364 head must predate any owner closure schema migration');
} else {
  execFileSync('git', ['merge-base', '--is-ancestor', V364_QUALIFIED_HEAD, head]);
  assert.ok(migrationFiles.includes('033_v365_owner_closure_records.sql'), 'schema-bearing descendant must use the approved V365 migration filename');
  assert.ok(fs.existsSync(APPROVED_V365_MIGRATION), 'approved V365 migration must exist');
  assert.equal(closureSchemaPresent, true, 'approved schema-bearing descendant must contain the V365 closure schema foundation');
}

// The implementation plan must be complete enough to prevent a route-first or client-authoritative writer.
const requiredPrerequisites = new Set(readiness.implementationPrerequisites);
for (const requirement of [
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
  'deployment_disabled_until_protected_review_and_merge_governance'
]) assert.ok(requiredPrerequisites.has(requirement), `missing implementation prerequisite ${requirement}`);

const order = readiness.implementationOrder;
const index = (step) => order.indexOf(step);
assert.ok(index('add_dedicated_schema_and_constraints') < index('add_non_routable_server_writer'));
assert.ok(index('add_non_routable_server_writer') < index('prove_writer_runtime_against_postgres'));
assert.ok(index('prove_writer_runtime_against_postgres') < index('add_dedicated_route_only_after_writer_proofs'));
assert.ok(index('prove_replay_cas_scope_audit_and_rollback') < index('add_dedicated_route_only_after_writer_proofs'));
assert.ok(index('add_dedicated_route_only_after_writer_proofs') < index('complete_protected_independent_review_before_any_promotion'));

for (const code of [
  'IDEMPOTENCY_CONFLICT',
  'STALE_TARGET_VERSION',
  'TENANT_SCOPE_MISMATCH',
  'WORKSPACE_SCOPE_MISMATCH',
  'AUTHORIZATION_BINDING_MISMATCH',
  'AUTHORIZATION_STALE_OR_REVOKED',
  'PERSISTENCE_TRANSACTION_ABORTED'
]) assert.ok(readiness.requiredFailureSemantics.includes(code), `missing fail-closed semantic ${code}`);

// These values describe the frozen V364 readiness decision, not live descendant repository state.
assert.equal(readiness.state, 'ready_for_separate_implementation_branch');
assert.equal(readiness.implementationMustRemainSeparate, true);
assert.equal(readiness.currentProductionClosureWriter, false);
assert.equal(readiness.currentProductionClosureSchema, false);
assert.equal(readiness.currentProductionClosureRoute, false);
assert.equal(readiness.migrationAdded, false);
assert.equal(readiness.productionWriterAdded, false);
assert.equal(readiness.routeAdded, false);
assert.equal(readiness.deploymentPathAdded, false);
assert.equal(readiness.liveClosurePersistenceEnabled, false);
assert.equal(readiness.authority, 'implementation_readiness_only_no_live_writer');

console.log(JSON.stringify(readiness));
console.log('V364 Production Closure Writer Adapter Implementation Readiness: PASS');
console.log(AUTHORITY);
