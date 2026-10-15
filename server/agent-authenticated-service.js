import { authorizeAgentExecution } from "./agent-execution-authorization.js";
import { createPostgresAgentApprovalStore } from "./agent-postgres-store.js";

/**
 * Node-only integration seam. Call only from an authenticated backend route.
 * The authenticated principal, server policy, pool and tenant ID MUST be
 * supplied by the server. No request-body field may override them.
 *
 * This authorizes an action; it does NOT execute it. A durable outbox is
 * required before irreversible side effects can be enabled.
 */
export async function authorizeAuthenticatedAgentAction({
  pool, principal, action, args, approvalId, policy
}) {
  const tenantId = principal?.tenantId;
  const actorId = principal?.actorId;
  if (!tenantId || !actorId || !pool || !policy) {
    return { allowed: false, reason: "unauthenticated_or_unconfigured" };
  }
  if (typeof tenantId !== "string" || typeof actorId !== "string") {
    return { allowed: false, reason: "invalid_principal" };
  }
  const store = createPostgresAgentApprovalStore(pool, tenantId);
  return authorizeAgentExecution({
    store, action, args, approvalId, policy,
    context: { tenantId, actorId }
  });
}
