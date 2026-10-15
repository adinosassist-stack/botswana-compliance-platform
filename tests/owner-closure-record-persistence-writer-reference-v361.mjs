export const V361_REFERENCE_ONLY = true;

const BINDING_FIELDS = Object.freeze([
  'disposition',
  'wording',
  'namespace',
  'kind',
  'sourceKey',
  'authorizationReference',
  'idempotencyKey',
  'expectedVersion',
  'residualCarryover'
]);

export class ReferenceWriteError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ReferenceWriteError';
    this.code = code;
  }
}

function clone(value) {
  return structuredClone(value);
}

function exactString(value) {
  return String(value ?? '');
}

function requireNonEmpty(value, code) {
  if (!exactString(value)) throw new ReferenceWriteError(code);
}

function sameBinding(left, right) {
  return BINDING_FIELDS.every((field) => left?.[field] === right?.[field]);
}

function sameTarget(left, right) {
  return left?.tenantId === right?.tenantId &&
    left?.workspaceId === right?.workspaceId &&
    left?.namespace === right?.namespace &&
    left?.kind === right?.kind &&
    left?.sourceKey === right?.sourceKey;
}

function validateBinding(binding) {
  if (!binding || typeof binding !== 'object') throw new ReferenceWriteError('BINDING_REQUIRED');
  for (const field of ['disposition', 'wording', 'namespace', 'kind', 'sourceKey', 'authorizationReference', 'idempotencyKey']) {
    requireNonEmpty(binding[field], `BINDING_${field.toUpperCase()}_REQUIRED`);
  }
  if (!Number.isInteger(binding.expectedVersion) || binding.expectedVersion < 0) {
    throw new ReferenceWriteError('BINDING_EXPECTED_VERSION_INVALID');
  }
  if (typeof binding.residualCarryover !== 'string') throw new ReferenceWriteError('BINDING_RESIDUAL_CARRYOVER_REQUIRED');
}

function validateAuthorization(authorization, binding, serverContext) {
  if (!authorization || typeof authorization !== 'object') throw new ReferenceWriteError('AUTHORIZATION_REQUIRED');
  if (authorization.status !== 'active' || authorization.revoked === true) {
    throw new ReferenceWriteError('AUTHORIZATION_NOT_ACTIVE');
  }
  requireNonEmpty(authorization.reference, 'AUTHORIZATION_REFERENCE_REQUIRED');
  requireNonEmpty(authorization.tenantId, 'AUTHORIZATION_TENANT_REQUIRED');
  requireNonEmpty(authorization.workspaceId, 'AUTHORIZATION_WORKSPACE_REQUIRED');
  if (!authorization.binding || !sameBinding(authorization.binding, binding)) {
    throw new ReferenceWriteError('AUTHORIZATION_BINDING_MISMATCH');
  }
  if (authorization.reference !== binding.authorizationReference) {
    throw new ReferenceWriteError('AUTHORIZATION_REFERENCE_MISMATCH');
  }
  if (authorization.tenantId !== serverContext.tenantId || authorization.workspaceId !== serverContext.workspaceId) {
    throw new ReferenceWriteError('AUTHORIZATION_SCOPE_MISMATCH');
  }
  if (authorization.authorizedActorId && authorization.authorizedActorId !== serverContext.actorId) {
    throw new ReferenceWriteError('AUTHORIZATION_ACTOR_MISMATCH');
  }
}

function validateServerContext(serverContext) {
  if (!serverContext || serverContext.authenticated !== true) throw new ReferenceWriteError('AUTHENTICATION_REQUIRED');
  for (const field of ['tenantId', 'workspaceId', 'actorId', 'requestId', 'now']) {
    requireNonEmpty(serverContext[field], `SERVER_${field.toUpperCase()}_REQUIRED`);
  }
}

function targetRows(records, serverContext, binding) {
  return records.filter((record) => sameTarget(record, {
    tenantId: serverContext.tenantId,
    workspaceId: serverContext.workspaceId,
    namespace: binding.namespace,
    kind: binding.kind,
    sourceKey: binding.sourceKey
  }));
}

function idempotencyRows(records, serverContext, key) {
  return records.filter((record) =>
    record.tenantId === serverContext.tenantId &&
    record.workspaceId === serverContext.workspaceId &&
    record.idempotencyKey === key
  );
}

function assertNoDuplicateTarget(rows) {
  if (rows.length > 1) throw new ReferenceWriteError('DUPLICATE_TARGET_CONFLICT');
}

function assertCas(rows, expectedVersion) {
  const currentVersion = rows.length === 1 ? rows[0].version : 0;
  if (currentVersion !== expectedVersion) throw new ReferenceWriteError('STALE_TARGET_VERSION');
  return currentVersion;
}

function replayResult(rows, authorization, binding) {
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new ReferenceWriteError('IDEMPOTENCY_CONFLICT');
  const existing = rows[0];
  if (!sameBinding(existing.binding, binding) || existing.authorizationReference !== authorization.reference) {
    throw new ReferenceWriteError('IDEMPOTENCY_CONFLICT');
  }
  return Object.freeze({
    status: 'already_committed',
    durable: true,
    created: false,
    record: clone(existing)
  });
}

export function createReferenceStore(seedRecords = []) {
  let state = { records: clone(seedRecords) };
  let queue = Promise.resolve();

  async function atomic(work) {
    const previous = queue;
    let release;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const draft = clone(state);
      const result = await work(draft);
      state = draft;
      return result;
    } finally {
      release();
    }
  }

  return Object.freeze({
    atomic,
    snapshot() { return clone(state); }
  });
}

export function createReferenceWriter({ store } = {}) {
  if (!store || typeof store.atomic !== 'function' || typeof store.snapshot !== 'function') {
    throw new ReferenceWriteError('REFERENCE_STORE_REQUIRED');
  }

  return Object.freeze({
    async write({ authorization, binding, serverContext, failpoint = '' } = {}) {
      validateServerContext(serverContext);
      validateBinding(binding);
      validateAuthorization(authorization, binding, serverContext);

      const transactionResult = await store.atomic(async (draft) => {
        const replayRows = idempotencyRows(draft.records, serverContext, binding.idempotencyKey);
        const replay = replayResult(replayRows, authorization, binding);
        if (replay) return replay;

        if (failpoint === 'after_idempotency_check') throw new ReferenceWriteError('INJECTED_TRANSACTION_FAILURE');

        const targets = targetRows(draft.records, serverContext, binding);
        assertNoDuplicateTarget(targets);
        const currentVersion = assertCas(targets, binding.expectedVersion);

        const record = Object.freeze({
          tenantId: serverContext.tenantId,
          workspaceId: serverContext.workspaceId,
          namespace: binding.namespace,
          kind: binding.kind,
          sourceKey: binding.sourceKey,
          disposition: binding.disposition,
          wording: binding.wording,
          residualCarryover: binding.residualCarryover,
          authorizationReference: authorization.reference,
          idempotencyKey: binding.idempotencyKey,
          version: currentVersion + 1,
          binding: clone(binding),
          audit: Object.freeze({
            actorId: serverContext.actorId,
            requestId: serverContext.requestId,
            recordedAt: serverContext.now
          })
        });

        const nextRecords = draft.records.filter((existing) => !sameTarget(existing, record));
        nextRecords.push(record);
        draft.records = nextRecords;

        if (failpoint === 'after_stage_before_commit') throw new ReferenceWriteError('INJECTED_PERSISTENCE_FAILURE');

        return Object.freeze({
          status: 'committed',
          durable: true,
          created: true,
          record: clone(record)
        });
      });

      return transactionResult;
    }
  });
}

export const V361_AUTHORITY_BOUNDARY = Object.freeze({
  referenceOnly: true,
  routable: false,
  deployed: false,
  productionPersistence: false,
  networkAccess: false,
  environmentAccess: false,
  productionDatabaseAccess: false
});
