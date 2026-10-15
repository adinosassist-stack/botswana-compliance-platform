import { createHash } from 'node:crypto';

const TARGET_FIELDS = Object.freeze(['namespace', 'kind', 'sourceKey']);
const CLOSURE_FIELDS = Object.freeze(['disposition', 'wording', 'residualCarryover']);

export class OwnerClosureWriterError extends Error {
  constructor(code, message = code, cause = undefined) {
    super(message, cause ? { cause } : undefined);
    this.name = 'OwnerClosureWriterError';
    this.code = code;
  }
}

const text = (value) => String(value ?? '');
const requireText = (value, code) => {
  const normalized = text(value).trim();
  if (!normalized) throw new OwnerClosureWriterError(code);
  return normalized;
};

export const canonicalizeOwnerClosureValue = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalizeOwnerClosureValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeOwnerClosureValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const fingerprintOwnerClosureRequest = ({ target, closure, actorUserId }) => createHash('sha256')
  .update(canonicalizeOwnerClosureValue({
    action: 'PERSIST_OWNER_CLOSURE_RECORD',
    target,
    closure,
    actorUserId
  }))
  .digest('hex');

const normalizeRequest = (request = {}) => {
  const target = Object.freeze({
    namespace: requireText(request.namespace, 'TARGET_NAMESPACE_REQUIRED'),
    kind: requireText(request.kind, 'TARGET_KIND_REQUIRED'),
    sourceKey: requireText(request.sourceKey, 'TARGET_SOURCE_KEY_REQUIRED')
  });
  const closure = Object.freeze({
    disposition: requireText(request.disposition, 'CLOSURE_DISPOSITION_REQUIRED'),
    wording: requireText(request.wording, 'CLOSURE_WORDING_REQUIRED'),
    residualCarryover: Array.isArray(request.residualCarryover) ? structuredClone(request.residualCarryover) : null
  });
  if (!closure.residualCarryover) throw new OwnerClosureWriterError('RESIDUAL_CARRYOVER_ARRAY_REQUIRED');
  if (!Number.isInteger(request.expectedTargetVersion) || request.expectedTargetVersion <= 0) {
    throw new OwnerClosureWriterError('EXPECTED_TARGET_VERSION_INVALID');
  }
  return Object.freeze({
    target,
    closure,
    expectedTargetVersion: request.expectedTargetVersion,
    authorizationTokenId: requireText(request.authorizationTokenId, 'AUTHORIZATION_TOKEN_REQUIRED'),
    idempotencyKey: requireText(request.idempotencyKey, 'IDEMPOTENCY_KEY_REQUIRED')
  });
};

const normalizeServerContext = (serverContext = {}) => Object.freeze({
  tenantId: requireText(serverContext.tenantId, 'SERVER_TENANT_REQUIRED'),
  workspaceId: requireText(serverContext.workspaceId, 'SERVER_WORKSPACE_REQUIRED'),
  actorUserId: requireText(serverContext.actorUserId, 'SERVER_ACTOR_REQUIRED'),
  requestId: requireText(serverContext.requestId, 'SERVER_REQUEST_ID_REQUIRED')
});

const authorizationBinding = (normalized) => Object.freeze({
  ...normalized.target,
  ...normalized.closure,
  expectedTargetVersion: normalized.expectedTargetVersion,
  authorizationTokenId: normalized.authorizationTokenId,
  idempotencyKey: normalized.idempotencyKey
});

const sameCanonical = (left, right) => canonicalizeOwnerClosureValue(left) === canonicalizeOwnerClosureValue(right);

const validateAuthorization = (authorization, normalized, serverContext) => {
  if (!authorization || authorization.active !== true || authorization.revoked === true) {
    throw new OwnerClosureWriterError('AUTHORIZATION_STALE_OR_REVOKED');
  }
  if (text(authorization.tokenId) !== normalized.authorizationTokenId) {
    throw new OwnerClosureWriterError('AUTHORIZATION_BINDING_MISMATCH');
  }
  if (text(authorization.tenantId) !== serverContext.tenantId || text(authorization.workspaceId) !== serverContext.workspaceId) {
    throw new OwnerClosureWriterError('AUTHORIZATION_BINDING_MISMATCH');
  }
  if (authorization.actorUserId && text(authorization.actorUserId) !== serverContext.actorUserId) {
    throw new OwnerClosureWriterError('AUTHORIZATION_BINDING_MISMATCH');
  }
  if (!sameCanonical(authorization.binding, authorizationBinding(normalized))) {
    throw new OwnerClosureWriterError('AUTHORIZATION_BINDING_MISMATCH');
  }
};

const validateTarget = (current, normalized, serverContext) => {
  if (!current || typeof current !== 'object') throw new OwnerClosureWriterError('TARGET_NOT_FOUND');
  if (text(current.tenantId) !== serverContext.tenantId) throw new OwnerClosureWriterError('TENANT_SCOPE_MISMATCH');
  if (text(current.workspaceId) !== serverContext.workspaceId) throw new OwnerClosureWriterError('WORKSPACE_SCOPE_MISMATCH');
  for (const field of TARGET_FIELDS) {
    if (text(current[field]) !== normalized.target[field]) throw new OwnerClosureWriterError('TARGET_IDENTITY_MISMATCH');
  }
  if (!Number.isInteger(current.version) || current.version !== normalized.expectedTargetVersion) {
    throw new OwnerClosureWriterError('STALE_TARGET_VERSION');
  }
};

const existingResult = (row) => Object.freeze({
  status: 'already_committed',
  durable: true,
  created: false,
  record: Object.freeze({ ...row })
});

const committedResult = (row) => Object.freeze({
  status: 'committed',
  durable: true,
  created: true,
  record: Object.freeze({ ...row })
});

const lockTarget = async (client, serverContext, normalized) => {
  const key = canonicalizeOwnerClosureValue({
    tenantId: serverContext.tenantId,
    workspaceId: serverContext.workspaceId,
    ...normalized.target
  });
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
};

const findReplay = async (client, serverContext, idempotencyKey) => {
  const result = await client.query(
    `select id,tenant_id,workspace_id,actor_user_id,namespace,kind,source_key,disposition,wording,
            residual_carryover,expected_target_version,authorization_token_id,idempotency_key,
            request_fingerprint,record_version,recorded_at
       from owner_closure_records
      where tenant_id=$1 and workspace_id=$2 and idempotency_key=$3`,
    [serverContext.tenantId, serverContext.workspaceId, idempotencyKey]
  );
  return result.rows[0] || null;
};

const classifyReplay = (existing, fingerprint) => {
  if (!existing) return null;
  if (existing.request_fingerprint !== fingerprint) throw new OwnerClosureWriterError('IDEMPOTENCY_CONFLICT');
  return existingResult(existing);
};

const assertNoExistingTargetClosure = async (client, serverContext, normalized) => {
  const result = await client.query(
    `select id from owner_closure_records
      where tenant_id=$1 and workspace_id=$2 and namespace=$3 and kind=$4 and source_key=$5
        and expected_target_version=$6
      limit 1`,
    [serverContext.tenantId, serverContext.workspaceId, normalized.target.namespace, normalized.target.kind,
      normalized.target.sourceKey, normalized.expectedTargetVersion]
  );
  if (result.rowCount) throw new OwnerClosureWriterError('DUPLICATE_TARGET_CONFLICT');
};

const insertClosureRecord = async (client, serverContext, normalized, fingerprint) => {
  const result = await client.query(
    `insert into owner_closure_records(
      tenant_id,workspace_id,actor_user_id,namespace,kind,source_key,disposition,wording,residual_carryover,
      expected_target_version,authorization_token_id,idempotency_key,request_fingerprint
    ) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
    returning id,tenant_id,workspace_id,actor_user_id,namespace,kind,source_key,disposition,wording,
      residual_carryover,expected_target_version,authorization_token_id,idempotency_key,request_fingerprint,
      record_version,recorded_at`,
    [serverContext.tenantId, serverContext.workspaceId, serverContext.actorUserId, normalized.target.namespace,
      normalized.target.kind, normalized.target.sourceKey, normalized.closure.disposition, normalized.closure.wording,
      JSON.stringify(normalized.closure.residualCarryover), normalized.expectedTargetVersion,
      normalized.authorizationTokenId, normalized.idempotencyKey, fingerprint]
  );
  return result.rows[0];
};

const insertAuditEvent = async (client, serverContext, normalized, record) => {
  const eventData = {
    workspaceId: serverContext.workspaceId,
    namespace: normalized.target.namespace,
    kind: normalized.target.kind,
    sourceKey: normalized.target.sourceKey,
    disposition: normalized.closure.disposition,
    expectedTargetVersion: normalized.expectedTargetVersion,
    authorizationTokenId: normalized.authorizationTokenId,
    idempotencyKey: normalized.idempotencyKey,
    requestFingerprint: record.request_fingerprint,
    recordVersion: record.record_version
  };
  const result = await client.query(
    `insert into audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id_text,request_id,event_data)
     values($1,$2,'OWNER_CLOSURE_RECORD_PERSISTED','owner_closure_record',$3,$4,$5::jsonb)
     returning id,occurred_at`,
    [serverContext.tenantId, serverContext.actorUserId, String(record.id), serverContext.requestId, JSON.stringify(eventData)]
  );
  return result.rows[0];
};

export function createOwnerClosureRecordWriter({ pool, verifyAuthorization, loadTarget } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new OwnerClosureWriterError('POOL_REQUIRED');
  if (typeof verifyAuthorization !== 'function') throw new OwnerClosureWriterError('AUTHORIZATION_VERIFIER_REQUIRED');
  if (typeof loadTarget !== 'function') throw new OwnerClosureWriterError('TARGET_LOADER_REQUIRED');

  return Object.freeze({
    async write({ request, serverContext } = {}) {
      const normalized = normalizeRequest(request);
      const scope = normalizeServerContext(serverContext);
      const fingerprint = fingerprintOwnerClosureRequest({
        target: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, ...normalized.target },
        closure: normalized.closure,
        actorUserId: scope.actorUserId
      });

      const client = await pool.connect();
      let began = false;
      try {
        await client.query('BEGIN');
        began = true;
        await lockTarget(client, scope, normalized);

        const authorization = await verifyAuthorization({
          client,
          tokenId: normalized.authorizationTokenId,
          binding: authorizationBinding(normalized),
          serverContext: scope
        });
        validateAuthorization(authorization, normalized, scope);

        const replay = classifyReplay(await findReplay(client, scope, normalized.idempotencyKey), fingerprint);
        if (replay) {
          await client.query('COMMIT');
          began = false;
          return replay;
        }

        const currentTarget = await loadTarget({ client, target: normalized.target, serverContext: scope });
        validateTarget(currentTarget, normalized, scope);
        await assertNoExistingTargetClosure(client, scope, normalized);

        let record;
        try {
          await client.query('SAVEPOINT owner_closure_insert');
          record = await insertClosureRecord(client, scope, normalized, fingerprint);
          await client.query('RELEASE SAVEPOINT owner_closure_insert');
        } catch (error) {
          if (error?.code !== '23505') throw error;
          await client.query('ROLLBACK TO SAVEPOINT owner_closure_insert');
          const raced = classifyReplay(await findReplay(client, scope, normalized.idempotencyKey), fingerprint);
          if (!raced) throw error;
          await client.query('COMMIT');
          began = false;
          return raced;
        }

        await insertAuditEvent(client, scope, normalized, record);
        await client.query('COMMIT');
        began = false;
        return committedResult(record);
      } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        if (error instanceof OwnerClosureWriterError) throw error;
        throw new OwnerClosureWriterError('PERSISTENCE_TRANSACTION_ABORTED', 'owner closure persistence transaction aborted', error);
      } finally {
        client.release();
      }
    }
  });
}

export const V366_AUTHORITY_BOUNDARY = Object.freeze({
  productionPersistenceCore: true,
  routable: false,
  routeAdded: false,
  uiTriggerAdded: false,
  workerWritePathAdded: false,
  deploymentActivated: false,
  liveProductionPersistenceEnabled: false,
  authority: 'non_routable_writer_core_only'
});

export const V366_WRITER_CONTRACT = Object.freeze({
  targetFields: TARGET_FIELDS,
  closureFields: CLOSURE_FIELDS,
  fingerprintSemantics: 'canonical_target_closure_actor_sha256',
  optimisticConcurrency: 'exact_observed_target_version',
  replaySemantics: 'same_scope_key_same_fingerprint_returns_existing_record',
  conflictSemantics: 'same_scope_key_changed_fingerprint_fails_closed',
  auditAtomicity: 'closure_record_and_audit_event_same_transaction_or_fail',
  rollbackSemantics: 'zero_partial_effects_on_any_failure',
  successSemantics: 'durable_success_only_after_commit'
});
