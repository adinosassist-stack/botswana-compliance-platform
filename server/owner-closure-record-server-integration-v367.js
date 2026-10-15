import { z } from 'zod';
import { OwnerClosureWriterError } from './owner-closure-record-writer-v366.js';

const closureRequestSchema = z.object({
  namespace: z.literal('operations'),
  kind: z.literal('owner_decision_note'),
  sourceKey: z.string().trim().min(1).max(240),
  disposition: z.enum(['Close', 'Keep open', 'Hold']),
  wording: z.string().trim().min(1).max(5000),
  residualCarryover: z.array(z.string().trim().min(1).max(500)).max(50),
  expectedTargetVersion: z.number().int().positive(),
  authorizationTokenId: z.string().trim().min(8).max(240),
  idempotencyKey: z.string().trim().min(8).max(240)
}).strict();

const writerErrorMap = Object.freeze({
  AUTHORIZATION_BINDING_MISMATCH: Object.freeze([409, 'authorization_binding_mismatch']),
  AUTHORIZATION_STALE_OR_REVOKED: Object.freeze([409, 'authorization_not_current']),
  IDEMPOTENCY_CONFLICT: Object.freeze([409, 'idempotency_conflict']),
  STALE_TARGET_VERSION: Object.freeze([409, 'stale_target_version']),
  TENANT_SCOPE_MISMATCH: Object.freeze([403, 'scope_mismatch']),
  WORKSPACE_SCOPE_MISMATCH: Object.freeze([403, 'scope_mismatch']),
  TARGET_IDENTITY_MISMATCH: Object.freeze([409, 'target_identity_mismatch']),
  TARGET_NOT_FOUND: Object.freeze([404, 'target_not_found']),
  DUPLICATE_TARGET_CONFLICT: Object.freeze([409, 'duplicate_target_conflict']),
  PERSISTENCE_TRANSACTION_ABORTED: Object.freeze([503, 'persistence_unavailable'])
});

const text = (value) => String(value ?? '').trim();
const respond = (res, status, payload) => res.status(status).json(payload);

const safeRecordProjection = (record = {}) => Object.freeze({
  id: record.id ?? null,
  namespace: record.namespace ?? null,
  kind: record.kind ?? null,
  sourceKey: record.source_key ?? record.sourceKey ?? null,
  disposition: record.disposition ?? null,
  wording: record.wording ?? null,
  residualCarryover: record.residual_carryover ?? record.residualCarryover ?? [],
  expectedTargetVersion: record.expected_target_version ?? record.expectedTargetVersion ?? null,
  recordVersion: record.record_version ?? record.recordVersion ?? null,
  recordedAt: record.recorded_at ?? record.recordedAt ?? null
});

export function createOwnerClosureServerIntegration({ writer, resolveWorkspace, enabled = false } = {}) {
  if (!writer || typeof writer.write !== 'function') throw new TypeError('writer.write is required');
  if (typeof resolveWorkspace !== 'function') throw new TypeError('resolveWorkspace is required');
  const routeEnabled = enabled === true;

  return Object.freeze({
    async handle(req, res, next = () => {}) {
      if (!routeEnabled) return respond(res, 404, { error: 'not_found' });
      if (req?.method !== 'POST') {
        if (typeof res?.setHeader === 'function') res.setHeader('Allow', 'POST');
        return respond(res, 405, { error: 'method_not_allowed' });
      }

      const tenantId = text(req?.auth?.tenant_id);
      const actorUserId = text(req?.auth?.user_id);
      if (!tenantId || !actorUserId) return respond(res, 401, { error: 'unauthenticated' });
      if (req?.auth?.role !== 'owner') return respond(res, 403, { error: 'forbidden' });

      const parsed = closureRequestSchema.safeParse(req?.body);
      if (!parsed.success) return respond(res, 400, { error: 'invalid_request' });

      const requestId = text(req?.requestId);
      if (!requestId) return respond(res, 500, { error: 'server_request_context_missing' });

      let workspaceId;
      try {
        workspaceId = text(await resolveWorkspace({
          auth: Object.freeze({ tenantId, actorUserId, role: 'owner' }),
          target: Object.freeze({
            namespace: parsed.data.namespace,
            kind: parsed.data.kind,
            sourceKey: parsed.data.sourceKey
          }),
          requestId
        }));
      } catch (error) {
        return next(error);
      }
      if (!workspaceId) return respond(res, 409, { error: 'workspace_resolution_failed' });

      try {
        const result = await writer.write({
          request: parsed.data,
          serverContext: Object.freeze({ tenantId, workspaceId, actorUserId, requestId })
        });
        const status = result?.created === true ? 201 : 200;
        return respond(res, status, {
          status: result?.status === 'already_committed' ? 'already_committed' : 'committed',
          durable: result?.durable === true,
          created: result?.created === true,
          record: safeRecordProjection(result?.record)
        });
      } catch (error) {
        if (error instanceof OwnerClosureWriterError && writerErrorMap[error.code]) {
          const [status, publicCode] = writerErrorMap[error.code];
          return respond(res, status, { error: publicCode });
        }
        return next(error);
      }
    }
  });
}

export const V367_ROUTE_CONTRACT = Object.freeze({
  intendedMethod: 'POST',
  intendedPath: '/api/owner-closure-records',
  requiredUpstreamMiddleware: Object.freeze(['auth', 'roles(owner)', 'requireEntitlement']),
  originAndCsrfProtection: 'existing_auth_middleware_required_on_registration',
  ownerCheckInsideHandler: true,
  strictBodyValidation: true,
  clientSuppliedScopeRejected: Object.freeze(['tenantId', 'workspaceId', 'actorUserId', 'requestFingerprint', 'recordId', 'recordedAt']),
  workspaceResolution: 'trusted_server_resolver_not_client_body',
  serverContextSources: Object.freeze({ tenantId: 'req.auth.tenant_id', actorUserId: 'req.auth.user_id', requestId: 'req.requestId' }),
  featureGate: 'constructor_enabled_true_required_default_false',
  routeRegistered: false,
  serverEntryPointModified: false,
  uiTriggerAdded: false,
  workerWritePathAdded: false,
  deploymentActivated: false,
  liveProductionPersistenceEnabled: false,
  authority: 'disabled_unregistered_server_integration_only'
});
