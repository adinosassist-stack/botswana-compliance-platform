import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  OwnerClosureWriterError,
  createOwnerClosureRecordWriter,
  fingerprintOwnerClosureRequest,
  V366_AUTHORITY_BOUNDARY,
  V366_WRITER_CONTRACT
} from '../server/owner-closure-record-writer-v366.js';

const { Pool } = pg;
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required for V366 runtime proof');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const expectCode = async (fn, code) => {
  let caught = null;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught, `${code} must fail`);
  assert.ok(caught instanceof OwnerClosureWriterError, `${code} must use OwnerClosureWriterError`);
  assert.equal(caught.code, code);
};

const bindingFor = (request) => ({
  namespace: request.namespace,
  kind: request.kind,
  sourceKey: request.sourceKey,
  disposition: request.disposition,
  wording: request.wording,
  residualCarryover: request.residualCarryover,
  expectedTargetVersion: request.expectedTargetVersion,
  authorizationTokenId: request.authorizationTokenId,
  idempotencyKey: request.idempotencyKey
});

const tenantId = randomUUID();
const actorUserId = randomUUID();
const workspaceId = 'workspace-v366';
const requestId = () => randomUUID();

const baseRequest = {
  namespace: 'operations',
  kind: 'owner_decision_note',
  sourceKey: 'decision-v366-happy',
  disposition: 'Close',
  wording: 'Owner confirmed the exact closure record after verified review.',
  residualCarryover: ['retain verified safeguard note'],
  expectedTargetVersion: 7,
  authorizationTokenId: 'auth-v366-happy',
  idempotencyKey: 'idem-v366-happy',
  requestFingerprint: 'f'.repeat(64)
};

const serverContext = (overrides = {}) => ({ tenantId, workspaceId, actorUserId, requestId: requestId(), ...overrides });

const verifyAuthorization = async ({ client, tokenId }) => {
  const result = await client.query(
    `select token_id,tenant_id,workspace_id,actor_user_id,active,revoked,binding
       from v366_authorizations where token_id=$1`, [tokenId]
  );
  const row = result.rows[0];
  return row && {
    tokenId: row.token_id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    active: row.active,
    revoked: row.revoked,
    binding: row.binding
  };
};

const loadTarget = async ({ client, target }) => {
  const result = await client.query(
    `select tenant_id,workspace_id,namespace,kind,source_key,version
       from v366_targets where namespace=$1 and kind=$2 and source_key=$3`,
    [target.namespace, target.kind, target.sourceKey]
  );
  const row = result.rows[0];
  return row && {
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    namespace: row.namespace,
    kind: row.kind,
    sourceKey: row.source_key,
    version: row.version
  };
};

const writer = createOwnerClosureRecordWriter({ pool, verifyAuthorization, loadTarget });

const putTarget = (request, { rowTenantId = tenantId, rowWorkspaceId = workspaceId, version = 7 } = {}) => pool.query(
  `insert into v366_targets(tenant_id,workspace_id,namespace,kind,source_key,version)
   values($1,$2,$3,$4,$5,$6)
   on conflict(namespace,kind,source_key) do update set tenant_id=excluded.tenant_id,workspace_id=excluded.workspace_id,version=excluded.version`,
  [rowTenantId, rowWorkspaceId, request.namespace, request.kind, request.sourceKey, version]
);

const putAuthorization = (request, { tokenId = request.authorizationTokenId, authTenantId = tenantId, authWorkspaceId = workspaceId, authActorUserId = actorUserId, active = true, revoked = false, binding = bindingFor(request) } = {}) => pool.query(
  `insert into v366_authorizations(token_id,tenant_id,workspace_id,actor_user_id,active,revoked,binding)
   values($1,$2,$3,$4,$5,$6,$7::jsonb)
   on conflict(token_id) do update set tenant_id=excluded.tenant_id,workspace_id=excluded.workspace_id,actor_user_id=excluded.actor_user_id,active=excluded.active,revoked=excluded.revoked,binding=excluded.binding`,
  [tokenId, authTenantId, authWorkspaceId, authActorUserId, active, revoked, JSON.stringify(binding)]
);

const countRows = async (sourceKey) => {
  const closure = await pool.query('select count(*)::int as count from owner_closure_records where tenant_id=$1 and source_key=$2', [tenantId, sourceKey]);
  const audit = await pool.query(
    `select count(*)::int as count from audit_events
      where tenant_id=$1 and event_type='OWNER_CLOSURE_RECORD_PERSISTED' and event_data->>'sourceKey'=$2`,
    [tenantId, sourceKey]
  );
  return { closure: closure.rows[0].count, audit: audit.rows[0].count };
};

try {
  await pool.query('drop table if exists v366_authorizations');
  await pool.query('drop table if exists v366_targets');
  await pool.query(`create table v366_targets(
    tenant_id uuid not null, workspace_id text not null, namespace text not null, kind text not null,
    source_key text not null, version integer not null, primary key(namespace,kind,source_key)
  )`);
  await pool.query(`create table v366_authorizations(
    token_id text primary key, tenant_id uuid not null, workspace_id text not null, actor_user_id uuid not null,
    active boolean not null, revoked boolean not null, binding jsonb not null
  )`);
  await pool.query('insert into tenants(id,name) values($1,$2)', [tenantId, 'V366 Runtime']);
  await pool.query(
    'insert into users(id,email,password_salt,password_hash) values($1,$2,$3,$4)',
    [actorUserId, `v366-${actorUserId}@example.test`, 'salt', 'hash']
  );

  // Happy path: one immutable closure record and one audit event, with server-computed fingerprint.
  await putTarget(baseRequest);
  await putAuthorization(baseRequest);
  const first = await writer.write({ request: baseRequest, serverContext: serverContext() });
  assert.equal(first.status, 'committed');
  assert.equal(first.created, true);
  assert.equal(first.durable, true);
  assert.notEqual(first.record.request_fingerprint, baseRequest.requestFingerprint, 'caller fingerprint must be ignored');
  const expectedFingerprint = fingerprintOwnerClosureRequest({
    target: { tenantId, workspaceId, namespace: baseRequest.namespace, kind: baseRequest.kind, sourceKey: baseRequest.sourceKey },
    closure: { disposition: baseRequest.disposition, wording: baseRequest.wording, residualCarryover: baseRequest.residualCarryover },
    actorUserId
  });
  assert.equal(first.record.request_fingerprint, expectedFingerprint, 'writer must compute canonical fingerprint server-side');
  assert.deepEqual(await countRows(baseRequest.sourceKey), { closure: 1, audit: 1 });

  // Exact replay returns the durable record and never duplicates audit.
  const replay = await writer.write({ request: baseRequest, serverContext: serverContext() });
  assert.equal(replay.status, 'already_committed');
  assert.equal(replay.created, false);
  assert.equal(replay.record.id, first.record.id);
  assert.deepEqual(await countRows(baseRequest.sourceKey), { closure: 1, audit: 1 });

  // Same idempotency key with changed material semantics fails closed after binding is re-authorized.
  const changed = { ...baseRequest, wording: 'Materially changed closure wording.' };
  await putAuthorization(changed);
  await expectCode(() => writer.write({ request: changed, serverContext: serverContext() }), 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await countRows(baseRequest.sourceKey), { closure: 1, audit: 1 });
  await putAuthorization(baseRequest);

  // Stale target version produces no closure or audit row.
  const stale = { ...baseRequest, sourceKey: 'decision-v366-stale', authorizationTokenId: 'auth-v366-stale', idempotencyKey: 'idem-v366-stale', expectedTargetVersion: 6 };
  await putTarget(stale, { version: 7 });
  await putAuthorization(stale);
  await expectCode(() => writer.write({ request: stale, serverContext: serverContext() }), 'STALE_TARGET_VERSION');
  assert.deepEqual(await countRows(stale.sourceKey), { closure: 0, audit: 0 });

  // Authorization is revalidated at write time and exact binding changes fail closed.
  const authMismatch = { ...baseRequest, sourceKey: 'decision-v366-auth-mismatch', authorizationTokenId: 'auth-v366-mismatch', idempotencyKey: 'idem-v366-mismatch' };
  await putTarget(authMismatch);
  await putAuthorization(authMismatch, { binding: { ...bindingFor(authMismatch), wording: 'different authorization wording' } });
  await expectCode(() => writer.write({ request: authMismatch, serverContext: serverContext() }), 'AUTHORIZATION_BINDING_MISMATCH');
  assert.deepEqual(await countRows(authMismatch.sourceKey), { closure: 0, audit: 0 });

  const revoked = { ...baseRequest, sourceKey: 'decision-v366-revoked', authorizationTokenId: 'auth-v366-revoked', idempotencyKey: 'idem-v366-revoked' };
  await putTarget(revoked);
  await putAuthorization(revoked, { revoked: true });
  await expectCode(() => writer.write({ request: revoked, serverContext: serverContext() }), 'AUTHORIZATION_STALE_OR_REVOKED');
  assert.deepEqual(await countRows(revoked.sourceKey), { closure: 0, audit: 0 });

  // Target tenant/workspace scope comes from the authoritative target reread, not request fields.
  const otherTenantId = randomUUID();
  await pool.query('insert into tenants(id,name) values($1,$2)', [otherTenantId, 'V366 Other Tenant']);
  const tenantMismatch = { ...baseRequest, sourceKey: 'decision-v366-tenant', authorizationTokenId: 'auth-v366-tenant', idempotencyKey: 'idem-v366-tenant' };
  await putTarget(tenantMismatch, { rowTenantId: otherTenantId });
  await putAuthorization(tenantMismatch);
  await expectCode(() => writer.write({ request: tenantMismatch, serverContext: serverContext() }), 'TENANT_SCOPE_MISMATCH');
  assert.deepEqual(await countRows(tenantMismatch.sourceKey), { closure: 0, audit: 0 });

  const workspaceMismatch = { ...baseRequest, sourceKey: 'decision-v366-workspace', authorizationTokenId: 'auth-v366-workspace', idempotencyKey: 'idem-v366-workspace' };
  await putTarget(workspaceMismatch, { rowWorkspaceId: 'workspace-other' });
  await putAuthorization(workspaceMismatch);
  await expectCode(() => writer.write({ request: workspaceMismatch, serverContext: serverContext() }), 'WORKSPACE_SCOPE_MISMATCH');
  assert.deepEqual(await countRows(workspaceMismatch.sourceKey), { closure: 0, audit: 0 });

  // Audit failure occurs after closure staging but must rollback the closure record as well.
  const auditFailureActor = randomUUID();
  const auditFailure = { ...baseRequest, sourceKey: 'decision-v366-audit-failure', authorizationTokenId: 'auth-v366-audit-failure', idempotencyKey: 'idem-v366-audit-failure' };
  await putTarget(auditFailure);
  await putAuthorization(auditFailure, { authActorUserId: auditFailureActor });
  await expectCode(
    () => writer.write({ request: auditFailure, serverContext: serverContext({ actorUserId: auditFailureActor }) }),
    'PERSISTENCE_TRANSACTION_ABORTED'
  );
  assert.deepEqual(await countRows(auditFailure.sourceKey), { closure: 0, audit: 0 });

  // Two independently authorized writers racing the same target/version serialize; one commits, one fails duplicate-target.
  const concurrentA = { ...baseRequest, sourceKey: 'decision-v366-race', authorizationTokenId: 'auth-v366-race-a', idempotencyKey: 'idem-v366-race-a' };
  const concurrentB = { ...concurrentA, authorizationTokenId: 'auth-v366-race-b', idempotencyKey: 'idem-v366-race-b' };
  await putTarget(concurrentA);
  await putAuthorization(concurrentA);
  await putAuthorization(concurrentB);
  const raced = await Promise.allSettled([
    writer.write({ request: concurrentA, serverContext: serverContext() }),
    writer.write({ request: concurrentB, serverContext: serverContext() })
  ]);
  assert.equal(raced.filter((entry) => entry.status === 'fulfilled').length, 1, 'exactly one concurrent target closure may commit');
  const rejected = raced.find((entry) => entry.status === 'rejected');
  assert.equal(rejected?.reason?.code, 'DUPLICATE_TARGET_CONFLICT');
  assert.deepEqual(await countRows(concurrentA.sourceKey), { closure: 1, audit: 1 });

  for (const [key, value] of Object.entries({
    productionPersistenceCore: true,
    routable: false,
    routeAdded: false,
    uiTriggerAdded: false,
    workerWritePathAdded: false,
    deploymentActivated: false,
    liveProductionPersistenceEnabled: false
  })) assert.equal(V366_AUTHORITY_BOUNDARY[key], value, `authority ${key}`);
  assert.equal(V366_WRITER_CONTRACT.auditAtomicity, 'closure_record_and_audit_event_same_transaction_or_fail');
  assert.equal(V366_WRITER_CONTRACT.rollbackSemantics, 'zero_partial_effects_on_any_failure');
  assert.equal(V366_WRITER_CONTRACT.successSemantics, 'durable_success_only_after_commit');
} finally {
  await pool.query('delete from tenants where id=$1', [tenantId]).catch(() => {});
  await pool.query('drop table if exists v366_authorizations').catch(() => {});
  await pool.query('drop table if exists v366_targets').catch(() => {});
  await pool.end();
}

console.log('V366 Non-Routable Production Closure Writer Core: PASS');
console.log('V366 adds a transaction-capable production persistence core only — no API route, UI trigger, Worker write path, deployment activation, or live production persistence authority.');
