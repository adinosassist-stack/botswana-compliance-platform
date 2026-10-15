import assert from 'node:assert/strict';
import {
  createReferenceStore,
  createReferenceWriter,
  ReferenceWriteError,
  V361_AUTHORITY_BOUNDARY,
  V361_REFERENCE_ONLY
} from './owner-closure-record-persistence-writer-reference-v361.mjs';

const baseBinding = Object.freeze({
  disposition: 'Close',
  wording: 'Close the owner decision with verified residual obligations preserved.',
  namespace: 'operations',
  kind: 'owner_decision_closure_record',
  sourceKey: 'owner_attention:decision-1',
  authorizationReference: 'auth-ref-1',
  idempotencyKey: 'idem-1',
  expectedVersion: 0,
  residualCarryover: 'Residual supplier obligation remains under human review.'
});

const baseContext = Object.freeze({
  authenticated: true,
  tenantId: 'tenant-a',
  workspaceId: 'workspace-a',
  actorId: 'owner-a',
  requestId: 'request-1',
  now: '2026-10-15T20:00:00+02:00'
});

function authorizationFor(binding = baseBinding, overrides = {}) {
  return {
    status: 'active',
    revoked: false,
    reference: binding.authorizationReference,
    tenantId: baseContext.tenantId,
    workspaceId: baseContext.workspaceId,
    authorizedActorId: baseContext.actorId,
    binding: structuredClone(binding),
    ...overrides
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof ReferenceWriteError && error.code === code, `expected ${code}`);
}

assert.equal(V361_REFERENCE_ONLY, true);
assert.deepEqual(V361_AUTHORITY_BOUNDARY, {
  referenceOnly: true,
  routable: false,
  deployed: false,
  productionPersistence: false,
  networkAccess: false,
  environmentAccess: false,
  productionDatabaseAccess: false
});

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  const result = await writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: baseContext });
  assert.equal(result.status, 'committed');
  assert.equal(result.durable, true);
  assert.equal(result.created, true);
  assert.equal(store.snapshot().records.length, 1);
  assert.equal(result.record.audit.actorId, baseContext.actorId);
}

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  await writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: baseContext });
  const retry = await writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: { ...baseContext, requestId: 'request-retry' } });
  assert.equal(retry.status, 'already_committed');
  assert.equal(retry.durable, true);
  assert.equal(retry.created, false);
  assert.equal(store.snapshot().records.length, 1, 'replay must not create a second record');
}

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  await writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: baseContext });
  const changed = { ...baseBinding, wording: `${baseBinding.wording} Changed.` };
  await expectCode(writer.write({ authorization: authorizationFor(), binding: changed, serverContext: baseContext }), 'AUTHORIZATION_BINDING_MISMATCH');
}

for (const field of ['disposition', 'namespace', 'kind', 'sourceKey', 'authorizationReference', 'residualCarryover']) {
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  const changed = { ...baseBinding, [field]: `${baseBinding[field]}-changed` };
  await expectCode(writer.write({ authorization: authorizationFor(), binding: changed, serverContext: baseContext }), 'AUTHORIZATION_BINDING_MISMATCH');
}

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  await expectCode(writer.write({ authorization: authorizationFor(baseBinding, { status: 'stale' }), binding: baseBinding, serverContext: baseContext }), 'AUTHORIZATION_NOT_ACTIVE');
  await expectCode(writer.write({ authorization: authorizationFor(baseBinding, { revoked: true }), binding: baseBinding, serverContext: baseContext }), 'AUTHORIZATION_NOT_ACTIVE');
  await expectCode(writer.write({ authorization: authorizationFor(baseBinding, { status: 'unknown' }), binding: baseBinding, serverContext: baseContext }), 'AUTHORIZATION_NOT_ACTIVE');
}

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  await expectCode(writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: { ...baseContext, tenantId: 'tenant-b' } }), 'AUTHORIZATION_SCOPE_MISMATCH');
  await expectCode(writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: { ...baseContext, workspaceId: 'workspace-b' } }), 'AUTHORIZATION_SCOPE_MISMATCH');
}

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  const first = { ...baseBinding, idempotencyKey: 'race-1' };
  const second = { ...baseBinding, idempotencyKey: 'race-2' };
  const results = await Promise.allSettled([
    writer.write({ authorization: authorizationFor(first), binding: first, serverContext: { ...baseContext, requestId: 'race-request-1' } }),
    writer.write({ authorization: authorizationFor(second), binding: second, serverContext: { ...baseContext, requestId: 'race-request-2' } })
  ]);
  assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1, 'only one concurrent writer may commit');
  const rejected = results.find((entry) => entry.status === 'rejected');
  assert.equal(rejected.reason.code, 'STALE_TARGET_VERSION');
  assert.equal(store.snapshot().records.length, 1);
}

{
  const seed = [{
    tenantId: baseContext.tenantId,
    workspaceId: baseContext.workspaceId,
    namespace: baseBinding.namespace,
    kind: baseBinding.kind,
    sourceKey: baseBinding.sourceKey,
    disposition: 'Hold',
    wording: 'Existing',
    residualCarryover: '',
    authorizationReference: 'prior-auth',
    idempotencyKey: 'prior-idem',
    version: 2,
    binding: { ...baseBinding, expectedVersion: 1, idempotencyKey: 'prior-idem', authorizationReference: 'prior-auth' },
    audit: { actorId: 'owner-a', requestId: 'prior', recordedAt: baseContext.now }
  }];
  const store = createReferenceStore(seed);
  const writer = createReferenceWriter({ store });
  await expectCode(writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: baseContext }), 'STALE_TARGET_VERSION');
}

for (const failpoint of ['after_idempotency_check', 'after_stage_before_commit']) {
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  const before = store.snapshot();
  const code = failpoint === 'after_idempotency_check' ? 'INJECTED_TRANSACTION_FAILURE' : 'INJECTED_PERSISTENCE_FAILURE';
  await expectCode(writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: baseContext, failpoint }), code);
  assert.deepEqual(store.snapshot(), before, `${failpoint} must roll back all staged changes`);
}

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  const forged = { ...baseBinding, actorId: 'attacker', requestId: 'forged-request', recordedAt: '1900-01-01T00:00:00Z' };
  const authorization = authorizationFor(forged);
  const result = await writer.write({ authorization, binding: forged, serverContext: baseContext });
  assert.equal(result.record.audit.actorId, baseContext.actorId);
  assert.equal(result.record.audit.requestId, baseContext.requestId);
  assert.equal(result.record.audit.recordedAt, baseContext.now);
  assert.equal('actorId' in result.record.binding, true, 'extra client fields may remain in authorization snapshot only');
  assert.equal('actorId' in result.record.audit && result.record.audit.actorId === 'attacker', false, 'client actor must not control audit provenance');
}

{
  const duplicateSeed = [0, 1].map((index) => ({
    tenantId: baseContext.tenantId,
    workspaceId: baseContext.workspaceId,
    namespace: baseBinding.namespace,
    kind: baseBinding.kind,
    sourceKey: baseBinding.sourceKey,
    disposition: 'Hold',
    wording: `Duplicate ${index}`,
    residualCarryover: '',
    authorizationReference: `prior-auth-${index}`,
    idempotencyKey: `prior-idem-${index}`,
    version: 1,
    binding: { ...baseBinding, idempotencyKey: `prior-idem-${index}`, authorizationReference: `prior-auth-${index}` },
    audit: { actorId: 'owner-a', requestId: `prior-${index}`, recordedAt: baseContext.now }
  }));
  const store = createReferenceStore(duplicateSeed);
  const writer = createReferenceWriter({ store });
  await expectCode(writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: baseContext }), 'DUPLICATE_TARGET_CONFLICT');
  assert.equal(store.snapshot().records.length, 2, 'conflict must not mutate corrupt seed state');
}

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  const first = await writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: baseContext });
  assert.equal(first.status, 'committed');
  const second = await writer.write({ authorization: authorizationFor(), binding: baseBinding, serverContext: { ...baseContext, requestId: 'uncertain-retry' } });
  assert.equal(second.status, 'already_committed', 'retry after uncertain response must resolve deterministically');
  assert.equal(store.snapshot().records.length, 1);
}

{
  const store = createReferenceStore();
  const writer = createReferenceWriter({ store });
  const changedCarryover = { ...baseBinding, residualCarryover: '' };
  await expectCode(writer.write({ authorization: authorizationFor(), binding: changedCarryover, serverContext: baseContext }), 'AUTHORIZATION_BINDING_MISMATCH');
}

console.log('V361 Owner Closure Record Persistence Writer Reference Conformance: PASS');
