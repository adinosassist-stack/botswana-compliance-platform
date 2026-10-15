import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  V361_REFERENCE_ONLY,
  V361_AUTHORITY_BOUNDARY,
  createReferenceStore,
  createReferenceWriter
} from './owner-closure-record-persistence-writer-reference-v361.mjs';

const v362 = fs.readFileSync('tests/owner-closure-record-production-persistence-adapter-conformance-v362.mjs', 'utf8');

const canonicalize = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const fingerprintRequest = ({ target, closure, actorUserId }) => createHash('sha256')
  .update(canonicalize({
    action: 'PERSIST_OWNER_CLOSURE_RECORD',
    target,
    closure,
    actorUserId
  }))
  .digest('hex');

class AdapterDesignError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AdapterDesignError';
    this.code = code;
  }
}

const assertScope = (serverScope, target) => {
  if (serverScope.tenantId !== target.tenantId) throw new AdapterDesignError('TENANT_SCOPE_MISMATCH', 'tenant scope mismatch');
  if (serverScope.workspaceId !== target.workspaceId) throw new AdapterDesignError('WORKSPACE_SCOPE_MISMATCH', 'workspace scope mismatch');
  return true;
};

const assertCas = (currentVersion, expectedVersion) => {
  if (currentVersion !== expectedVersion) throw new AdapterDesignError('STALE_TARGET_VERSION', 'target version changed');
  return true;
};

const classifyReplay = (existing, request) => {
  if (!existing) return 'new';
  if (existing.idempotencyKey !== request.idempotencyKey) return 'new';
  if (existing.requestFingerprint !== request.requestFingerprint) {
    throw new AdapterDesignError('IDEMPOTENCY_CONFLICT', 'idempotency key was already used for a different closure request');
  }
  return 'replay';
};

const DESIGN_AUTHORITY = 'V363 defines a production closure-writer adapter design only — it creates no schema, migration, writer, route, endpoint, live closure mutation, decision closure, or execution authority.';

const adapterDesign = Object.freeze({
  release: '20261015-owner-closure-record-production-writer-adapter-design-review-v363',
  storageModel: 'immutable_append_only_closure_record',
  authoritativeScope: Object.freeze(['tenantId', 'workspaceId', 'actorUserId']),
  serverGenerated: Object.freeze(['recordId', 'recordVersion', 'recordedAt', 'auditEventId']),
  targetIdentity: Object.freeze(['namespace', 'kind', 'sourceKey']),
  persistedClosureFields: Object.freeze(['disposition', 'wording', 'residualCarryover']),
  requestControls: Object.freeze(['expectedTargetVersion', 'idempotencyKey', 'authorizationTokenId']),
  fingerprintSemantics: 'canonical_target_closure_actor_sha256',
  optimisticConcurrency: 'exact_observed_target_version',
  idempotencyReplay: 'same_key_same_fingerprint_returns_existing_record',
  idempotencyConflict: 'same_key_changed_fingerprint_fails_closed',
  auditAtomicity: 'closure_record_and_audit_event_same_transaction_or_fail',
  rollbackSemantics: 'zero_partial_effects_on_any_failure',
  transactionSteps: Object.freeze([
    'begin_checked_out_database_transaction',
    'bind_server_authoritative_tenant_workspace_actor',
    'normalize_exact_target_and_closure_payload',
    'verify_human_authorization_and_payload_fingerprint',
    'resolve_idempotency_replay_or_conflict',
    'compare_exact_observed_target_version',
    'append_immutable_closure_record',
    'append_audit_event_in_same_transaction',
    'commit_transaction',
    'rollback_all_effects_on_any_failure'
  ]),
  genericStateEndpointIsClosureWriter: false,
  routable: false,
  migrationAdded: false,
  productionWriterAdded: false,
  deploymentPathAdded: false,
  liveClosurePersistenceEnabled: false,
  authority: 'design_review_only_no_live_writer'
});

// V361 remains the semantic contract and must still be explicitly reference-only.
assert.equal(V361_REFERENCE_ONLY, true);
assert.match(V361_AUTHORITY_BOUNDARY, /Reference writer only/);
const referenceWriter = createReferenceWriter(createReferenceStore());
assert.equal(referenceWriter.referenceOnly, true);
assert.equal(referenceWriter.routable, false);
assert.equal(referenceWriter.productionPersistence, false);

// V362 must continue to provide the production primitive evidence that V363 designs against.
for (const token of [
  "transactionCapability: 'verified'",
  "casCapability: 'verified'",
  "tenantIsolationCapability: 'verified'",
  "serverProvenanceCapability: 'verified'",
  "singleConsumptionReplayCapability: 'verified'",
  "rollbackCapability: 'verified'",
  'closureWriterRoutable: false',
  'closureWriterDeployed: false',
  'liveClosurePersistenceEnabled: false'
]) assert.ok(v362.includes(token), `V362 capability evidence missing ${token}`);

// Design ownership: tenant/workspace/actor and generated provenance never become client-authoritative fields.
const clientSemanticFields = new Set([
  ...adapterDesign.targetIdentity,
  ...adapterDesign.persistedClosureFields,
  'expectedTargetVersion',
  'idempotencyKey'
]);
for (const field of [...adapterDesign.authoritativeScope, ...adapterDesign.serverGenerated]) {
  assert.ok(!clientSemanticFields.has(field), `server-owned field must not become client authoritative: ${field}`);
}

// Fingerprinting is canonical and binds target + closure semantics + authoritative actor.
const targetA = {
  tenantId: 'tenant-1',
  workspaceId: 'workspace-1',
  namespace: 'operations',
  kind: 'owner_decision_note',
  sourceKey: 'decision-42'
};
const closureA = {
  disposition: 'closed_after_owner_review',
  wording: 'Owner reviewed the closure evidence.',
  residualCarryover: ['retain verified safeguard note']
};
const fingerprintA = fingerprintRequest({ target: targetA, closure: closureA, actorUserId: 'owner-1' });
const fingerprintReordered = fingerprintRequest({
  target: {
    sourceKey: 'decision-42',
    kind: 'owner_decision_note',
    namespace: 'operations',
    workspaceId: 'workspace-1',
    tenantId: 'tenant-1'
  },
  closure: {
    residualCarryover: ['retain verified safeguard note'],
    wording: 'Owner reviewed the closure evidence.',
    disposition: 'closed_after_owner_review'
  },
  actorUserId: 'owner-1'
});
assert.equal(fingerprintA, fingerprintReordered, 'canonical fingerprint must be insensitive to object key order');
assert.notEqual(
  fingerprintA,
  fingerprintRequest({ target: targetA, closure: { ...closureA, wording: 'Changed closure wording.' }, actorUserId: 'owner-1' }),
  'semantic closure changes must change the request fingerprint'
);
assert.notEqual(
  fingerprintA,
  fingerprintRequest({ target: targetA, closure: closureA, actorUserId: 'owner-2' }),
  'authoritative actor changes must change the request fingerprint'
);

// Replay and stale-target behavior must preserve V361 fail-closed semantics.
const persisted = { idempotencyKey: 'idem-1', requestFingerprint: fingerprintA };
assert.equal(classifyReplay(null, persisted), 'new');
assert.equal(classifyReplay(persisted, persisted), 'replay');
assert.throws(
  () => classifyReplay(persisted, { ...persisted, requestFingerprint: 'different' }),
  (error) => error instanceof AdapterDesignError && error.code === 'IDEMPOTENCY_CONFLICT'
);
assert.equal(assertCas(7, 7), true);
assert.throws(
  () => assertCas(8, 7),
  (error) => error instanceof AdapterDesignError && error.code === 'STALE_TARGET_VERSION'
);
assert.equal(assertScope({ tenantId: 'tenant-1', workspaceId: 'workspace-1' }, targetA), true);
assert.throws(
  () => assertScope({ tenantId: 'tenant-2', workspaceId: 'workspace-1' }, targetA),
  (error) => error instanceof AdapterDesignError && error.code === 'TENANT_SCOPE_MISMATCH'
);
assert.throws(
  () => assertScope({ tenantId: 'tenant-1', workspaceId: 'workspace-2' }, targetA),
  (error) => error instanceof AdapterDesignError && error.code === 'WORKSPACE_SCOPE_MISMATCH'
);

// Atomicity order: provenance and authorization precede persistence; audit precedes commit; any failure rolls back all effects.
const indexOfStep = (step) => adapterDesign.transactionSteps.indexOf(step);
assert.ok(indexOfStep('bind_server_authoritative_tenant_workspace_actor') < indexOfStep('append_immutable_closure_record'));
assert.ok(indexOfStep('verify_human_authorization_and_payload_fingerprint') < indexOfStep('append_immutable_closure_record'));
assert.ok(indexOfStep('compare_exact_observed_target_version') < indexOfStep('append_immutable_closure_record'));
assert.ok(indexOfStep('append_immutable_closure_record') < indexOfStep('append_audit_event_in_same_transaction'));
assert.ok(indexOfStep('append_audit_event_in_same_transaction') < indexOfStep('commit_transaction'));
assert.ok(indexOfStep('rollback_all_effects_on_any_failure') > indexOfStep('commit_transaction'));
assert.equal(adapterDesign.storageModel, 'immutable_append_only_closure_record');
assert.equal(adapterDesign.auditAtomicity, 'closure_record_and_audit_event_same_transaction_or_fail');
assert.equal(adapterDesign.rollbackSemantics, 'zero_partial_effects_on_any_failure');

// V363 is design evidence only; nothing here enables a production mutation surface.
assert.equal(adapterDesign.genericStateEndpointIsClosureWriter, false);
assert.equal(adapterDesign.routable, false);
assert.equal(adapterDesign.migrationAdded, false);
assert.equal(adapterDesign.productionWriterAdded, false);
assert.equal(adapterDesign.deploymentPathAdded, false);
assert.equal(adapterDesign.liveClosurePersistenceEnabled, false);
assert.equal(adapterDesign.authority, 'design_review_only_no_live_writer');

console.log(JSON.stringify(adapterDesign));
console.log('V363 Production Closure Writer Adapter Design Review: PASS');
console.log(DESIGN_AUTHORITY);
