import { evaluateEmployeeDispatch } from "./employee-dispatch-admission.js";

/**
 * Transactional intent admission only. Does not execute tasks or reports.
 * The trusted store must resolve persisted proposal/review records inside
 * the transaction, enforce tenant-scoped unique idempotency and atomically
 * append the audit event and insert the intent.
 */
export async function queueEmployeeDispatch({
  store, identity, proposalId, action, idempotencyKey,
  featureEnabled = false, killSwitch = true, auditAvailable = false
} = {}) {
  if (!store || typeof store.transaction !== "function" ||
      typeof proposalId !== "string" || !proposalId.trim()) {
    return { queued: false, reason: "invalid_request" };
  }
  if (!featureEnabled || killSwitch || !auditAvailable) {
    return { queued: false, reason: "governance_unavailable" };
  }
  try {
    return await store.transaction(async tx => {
      if (typeof tx.getProposal !== "function" ||
          typeof tx.getLatestReview !== "function" ||
          typeof tx.isAuthorizedReviewer !== "function" ||
          typeof tx.isCurrentApprovedReview !== "function" ||
          typeof tx.isCurrentProposalRevision !== "function" ||
          typeof tx.appendAudit !== "function" ||
          typeof tx.insertIntentOnce !== "function") {
        throw Error("missing_dispatch_capabilities");
      }
      if (typeof tx.lockDispatchKey !== "function") throw Error("missing_dispatch_lock");
      if (typeof identity?.tenantId !== "string" || !identity.tenantId.trim() ||
          typeof idempotencyKey !== "string" || !idempotencyKey.trim() ||
          idempotencyKey.length > 200) return { queued: false, reason: "invalid_request" };
      const lockAcquired = await tx.lockDispatchKey(identity.tenantId, idempotencyKey);
      if (lockAcquired !== true) throw Error("dispatch_lock_unavailable");
      const proposal = await tx.getProposal(identity?.tenantId, proposalId);
      const review = proposal ? await tx.getLatestReview(identity?.tenantId, proposalId) : null;
      if (review && (await tx.isAuthorizedReviewer(identity.tenantId, review.reviewerId, proposalId, review.id)) !== true) {
        return { queued: false, reason: "approval_required" };
      }
      if (review && (await tx.isCurrentApprovedReview(identity.tenantId, proposalId, review.id)) !== true) {
        return { queued: false, reason: "approval_required" };
      }
      if (proposal && (await tx.isCurrentProposalRevision(identity.tenantId, proposalId, review?.id)) !== true) {
        return { queued: false, reason: "proposal_revision_stale" };
      }
      const decision = evaluateEmployeeDispatch({
        featureEnabled, killSwitch, auditAvailable, identity, proposal, review, action, idempotencyKey
      });
      if (!decision.allowed) return { queued: false, reason: decision.reason };
      const intent = {
        tenantId: identity.tenantId, proposalId: proposal.id,
        reviewId: review.id, action, idempotencyKey, intentType: decision.intentType
      };
      // Lock and storage MUST enforce uniqueness on (tenantId, idempotencyKey), and
      // reject a reused key if any immutable intent fields differ.
      const result = await tx.insertIntentOnce(intent);
      if (!result || !["created", "existing"].includes(result.status)) throw Error("invalid_insert_result");
      if (result.status === "existing" && result.sameIntent !== true) {
        return { queued: false, reason: "idempotency_conflict" };
      }
      await tx.appendAudit({
        type: "employee.dispatch.admitted", tenantId: identity.tenantId,
        actorId: identity.actorId, proposalId, reviewId: review.id,
        action, idempotencyKey, created: result.status === "created"
      });
      return { queued: result.status === "created", reason: result.status === "created" ? "intent_created" : "already_queued" };
    });
  } catch {
    return { queued: false, reason: "governance_unavailable" };
  }
}
