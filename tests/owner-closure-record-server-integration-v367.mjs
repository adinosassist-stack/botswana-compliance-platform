import assert from 'node:assert/strict';
import {
  createOwnerClosureServerIntegration,
  V367_ROUTE_CONTRACT
} from '../server/owner-closure-record-server-integration-v367.js';
import { OwnerClosureWriterError } from '../server/owner-closure-record-writer-v366.js';

const makeRes = () => ({
  statusCode: null,
  payload: null,
  headers: {},
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
  setHeader(name, value) { this.headers[name] = value; }
});

const validBody = () => ({
  namespace: 'operations',
  kind: 'owner_decision_note',
  sourceKey: 'decision-v367',
  disposition: 'Close',
  wording: 'Owner confirmed the exact closure record wording.',
  residualCarryover: ['retain verified safeguard note'],
  expectedTargetVersion: 7,
  authorizationTokenId: 'authorization-v367',
  idempotencyKey: 'idempotency-v367'
});

const ownerRequest = (overrides = {}) => ({
  method: 'POST',
  requestId: 'request-v367',
  auth: { tenant_id: 'tenant-v367', user_id: 'owner-v367', role: 'owner' },
  body: validBody(),
  ...overrides
});

let writeCalls = [];
let workspaceCalls = [];
const writer = {
  async write(input) {
    writeCalls.push(input);
    return {
      status: 'committed',
      durable: true,
      created: true,
      record: {
        id: 'record-v367',
        namespace: input.request.namespace,
        kind: input.request.kind,
        source_key: input.request.sourceKey,
        disposition: input.request.disposition,
        wording: input.request.wording,
        residual_carryover: input.request.residualCarryover,
        expected_target_version: input.request.expectedTargetVersion,
        authorization_token_id: input.request.authorizationTokenId,
        idempotency_key: input.request.idempotencyKey,
        request_fingerprint: 'a'.repeat(64),
        record_version: 1,
        recorded_at: '2026-10-15T00:00:00.000Z'
      }
    };
  }
};
const resolveWorkspace = async (input) => { workspaceCalls.push(input); return 'workspace-v367'; };

// Disabled by default: no resolver or writer invocation.
{
  const integration = createOwnerClosureServerIntegration({ writer, resolveWorkspace });
  const res = makeRes();
  await integration.handle(ownerRequest(), res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, { error: 'not_found' });
  assert.equal(writeCalls.length, 0);
  assert.equal(workspaceCalls.length, 0);
}

const integration = createOwnerClosureServerIntegration({ writer, resolveWorkspace, enabled: true });

// Method, auth and role fail closed before any write.
{
  const res = makeRes();
  await integration.handle(ownerRequest({ method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
}
{
  const res = makeRes();
  await integration.handle(ownerRequest({ auth: null }), res);
  assert.equal(res.statusCode, 401);
}
{
  const res = makeRes();
  await integration.handle(ownerRequest({ auth: { tenant_id: 'tenant-v367', user_id: 'manager-v367', role: 'manager' } }), res);
  assert.equal(res.statusCode, 403);
}

// Strict body rejects client attempts to inject authoritative scope/provenance.
for (const injected of [
  { tenantId: 'client-tenant' },
  { workspaceId: 'client-workspace' },
  { actorUserId: 'client-actor' },
  { requestFingerprint: 'b'.repeat(64) },
  { recordId: 'client-record' },
  { recordedAt: '2026-10-15T00:00:00Z' }
]) {
  const res = makeRes();
  await integration.handle(ownerRequest({ body: { ...validBody(), ...injected } }), res);
  assert.equal(res.statusCode, 400, `client scope/provenance injection must fail: ${Object.keys(injected)[0]}`);
  assert.deepEqual(res.payload, { error: 'invalid_request' });
}

// Missing server request context fails before resolver/writer.
{
  const res = makeRes();
  await integration.handle(ownerRequest({ requestId: '' }), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.payload, { error: 'server_request_context_missing' });
}

// Trusted resolver supplies workspace; tenant/actor/requestId come only from server auth context.
writeCalls = [];
workspaceCalls = [];
{
  const res = makeRes();
  await integration.handle(ownerRequest(), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.status, 'committed');
  assert.equal(res.payload.durable, true);
  assert.equal(res.payload.created, true);
  assert.equal(workspaceCalls.length, 1);
  assert.deepEqual(workspaceCalls[0].auth, { tenantId: 'tenant-v367', actorUserId: 'owner-v367', role: 'owner' });
  assert.equal(writeCalls.length, 1);
  assert.deepEqual(writeCalls[0].serverContext, {
    tenantId: 'tenant-v367',
    workspaceId: 'workspace-v367',
    actorUserId: 'owner-v367',
    requestId: 'request-v367'
  });
  assert.deepEqual(writeCalls[0].request, validBody());
  assert.equal('authorizationTokenId' in res.payload.record, false, 'response must not echo authorization token');
  assert.equal('idempotencyKey' in res.payload.record, false, 'response must not echo idempotency key');
  assert.equal('requestFingerprint' in res.payload.record, false, 'response must not expose server fingerprint');
}

// Replay is truthful HTTP 200 and does not masquerade as a new write.
{
  const replayWriter = {
    async write() {
      return { status: 'already_committed', durable: true, created: false, record: { id: 'record-existing', record_version: 1 } };
    }
  };
  const replayIntegration = createOwnerClosureServerIntegration({ writer: replayWriter, resolveWorkspace, enabled: true });
  const res = makeRes();
  await replayIntegration.handle(ownerRequest(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'already_committed');
  assert.equal(res.payload.created, false);
  assert.equal(res.payload.durable, true);
}

// Empty trusted workspace resolution fails closed.
{
  const noWorkspace = createOwnerClosureServerIntegration({ writer, resolveWorkspace: async () => '', enabled: true });
  const res = makeRes();
  await noWorkspace.handle(ownerRequest(), res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.payload, { error: 'workspace_resolution_failed' });
}

// Writer failures map to bounded public semantics; unknown errors flow to server error middleware.
for (const [code, expectedStatus, expectedPublic] of [
  ['AUTHORIZATION_BINDING_MISMATCH', 409, 'authorization_binding_mismatch'],
  ['AUTHORIZATION_STALE_OR_REVOKED', 409, 'authorization_not_current'],
  ['IDEMPOTENCY_CONFLICT', 409, 'idempotency_conflict'],
  ['STALE_TARGET_VERSION', 409, 'stale_target_version'],
  ['TENANT_SCOPE_MISMATCH', 403, 'scope_mismatch'],
  ['WORKSPACE_SCOPE_MISMATCH', 403, 'scope_mismatch'],
  ['TARGET_IDENTITY_MISMATCH', 409, 'target_identity_mismatch'],
  ['TARGET_NOT_FOUND', 404, 'target_not_found'],
  ['DUPLICATE_TARGET_CONFLICT', 409, 'duplicate_target_conflict'],
  ['PERSISTENCE_TRANSACTION_ABORTED', 503, 'persistence_unavailable']
]) {
  const failing = createOwnerClosureServerIntegration({
    writer: { async write() { throw new OwnerClosureWriterError(code, 'internal detail must not leak'); } },
    resolveWorkspace,
    enabled: true
  });
  const res = makeRes();
  await failing.handle(ownerRequest(), res);
  assert.equal(res.statusCode, expectedStatus, code);
  assert.deepEqual(res.payload, { error: expectedPublic }, code);
}

{
  const unknown = new Error('unexpected internal failure');
  const failing = createOwnerClosureServerIntegration({
    writer: { async write() { throw unknown; } },
    resolveWorkspace,
    enabled: true
  });
  const res = makeRes();
  let forwarded = null;
  await failing.handle(ownerRequest(), res, (error) => { forwarded = error; });
  assert.equal(forwarded, unknown);
  assert.equal(res.payload, null);
}

assert.equal(V367_ROUTE_CONTRACT.routeRegistered, false);
assert.equal(V367_ROUTE_CONTRACT.serverEntryPointModified, false);
assert.equal(V367_ROUTE_CONTRACT.featureGate, 'constructor_enabled_true_required_default_false');
assert.equal(V367_ROUTE_CONTRACT.workspaceResolution, 'trusted_server_resolver_not_client_body');
assert.equal(V367_ROUTE_CONTRACT.liveProductionPersistenceEnabled, false);
assert.equal(V367_ROUTE_CONTRACT.authority, 'disabled_unregistered_server_integration_only');

console.log('V367 Controlled Server Integration / Route Readiness: PASS');
console.log('V367 constructs a disabled server integration adapter only — no route registration, UI trigger, Worker write path, deployment activation, or live production persistence authority.');
