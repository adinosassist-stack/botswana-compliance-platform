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
  if (!store || typeof store.transaction !== "function") return { allowed: false, reason: "governance_unavailable" };
  if (!policy?.enabled || policy?.killSwitch || !policy?.auditAvailable) return { allowed: false, reason: "governance_unavailable" };
  try {
    return await store.transaction(async tx => {
      if (typeof tx.getApproval !== "function" || typeof tx.consumeApproval !== "function" || typeof tx.appendAudit !== "function") {
        throw new Error("missing_transaction_capabilities");
      }
      const approval = approvalId ? await tx.getApproval(approvalId) : null;
      const decision = evaluateAgentAction({ action, args, context, approval, policy });
      const event = {
        id: randomUUID(), tenantId: context?.tenantId ?? null,
        actorId: context?.actorId ?? null, action,
        argumentDigest: agentArgumentDigest(args),
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
