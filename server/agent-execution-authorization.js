import { randomUUID } from "node:crypto";
import { agentArgumentDigest, evaluateAgentAction } from "./agent-action-policy.js";

/**
 * Storage adapter contract:
 * transaction(async tx => ...), where tx provides
 * getApproval(id), consumeApproval(id, expectedNonce), appendAudit(event).
 * consumeApproval MUST be atomic, compare-and-set and return true exactly once.
 * Transaction MUST commit consumption and audit together or roll back both.
 */
export async function authorizeAgentExecution({ store, action, args, context, approvalId, policy }) {
  if (typeof context?.tenantId !== "string" || !context.tenantId.trim() || typeof context?.actorId !== "string" || !context.actorId.trim()) return { allowed: false, reason: "unauthorized_action" };
  if (!store || typeof store.transaction !== "function") return { allowed: false, reason: "governance_unavailable" };
  if (!policy?.enabled || policy?.killSwitch || !policy?.auditAvailable) return { allowed: false, reason: "governance_unavailable" };
  // Validate before starting the transaction: malformed model arguments must fail closed.
  let argumentDigest;
  try { argumentDigest = agentArgumentDigest(args); } catch { return { allowed: false, reason: "invalid_arguments" }; }
  try {
    return await store.transaction(async tx => {
      if (typeof tx.getApproval !== "function" || typeof tx.consumeApproval !== "function" || typeof tx.appendAudit !== "function") {
        throw new Error("missing_transaction_capabilities");
      }
      const trustedContext = { ...context, now: Date.now() };
      const approval = approvalId ? await tx.getApproval(approvalId) : null;
      const decision = evaluateAgentAction({ action, args, context: trustedContext, approval, policy });
      const event = {
        id: randomUUID(), tenantId: context?.tenantId ?? null,
        actorId: context?.actorId ?? null, action,
        argumentDigest,
        approvalId: approval?.id ?? null, allowed: false,
        reason: decision.reason, timestamp: new Date().toISOString()
      };
      if (!decision.allowed) {
        await tx.appendAudit(event);
        return decision;
      }
      if (decision.reason === "approval_valid_requires_atomic_consumption") {
        const consumed = await tx.consumeApproval(approval.id, approval.nonce);
        if (consumed !== true) {
          await tx.appendAudit({ ...event, reason: "approval_replayed" });
          return { allowed: false, reason: "approval_replayed" };
        }
      }
      await tx.appendAudit({ ...event, allowed: true, reason: "authorized" });
      return { allowed: true, reason: "authorized", authorizationId: event.id };
    });
  } catch {
    return { allowed: false, reason: "governance_unavailable" };
  }
}
