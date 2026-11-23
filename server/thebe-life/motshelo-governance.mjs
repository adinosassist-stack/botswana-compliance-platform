/**
 * Read-only governance decisions. Real endpoints must obtain authenticated
 * identities, membership and cleared settlement evidence from trusted stores.
 */
const ROLES = ['chair','treasurer','secretary','member','auditor'];
export function canMotsheloAction({actorId, groupId, membership, action}) {
  if (!actorId || !groupId || !membership || membership.userId !== actorId || membership.groupId !== groupId || membership.status !== 'active' || !ROLES.includes(membership.role)) return false;
  if (action === 'read_statement') return true;
  if (action === 'record_contribution') return ['treasurer','secretary'].includes(membership.role);
  if (action === 'propose_disbursement') return ['chair','treasurer'].includes(membership.role);
  if (action === 'review_disbursement') return ['chair','treasurer','secretary'].includes(membership.role);
  if (action === 'manage_members') return ['chair','secretary'].includes(membership.role);
  return false;
}
export function evaluateMotsheloDisbursement({request, approvals, requiredApprovals = 2, verifiedClearedMinor}) {
  if (!request || typeof request !== 'object' || typeof request.id !== 'string' || !request.id || typeof request.groupId !== 'string' || !request.groupId || typeof request.requestedBy !== 'string' || !request.requestedBy || !Number.isSafeInteger(request.amountMinor) || request.amountMinor <= 0) throw new TypeError('invalid_request');
  if (!Number.isInteger(requiredApprovals) || requiredApprovals < 2 || requiredApprovals > 10) throw new RangeError('invalid_approval_threshold');
  if (!Array.isArray(approvals) || approvals.length > 30) throw new TypeError('invalid_approvals');
  if (!Number.isSafeInteger(verifiedClearedMinor) || verifiedClearedMinor < 0) return Object.freeze({eligible:false,reason:'cleared_funds_unverified'});
  // Any active committee rejection or contradictory decision blocks qualification.
  // A fresh, separately audited review cycle must resolve a rejection.
  const decisions = new Map();
  for (const review of approvals) {
    if (!review || review.requestId !== request.id || review.groupId !== request.groupId ||
        !review.reviewerId || review.reviewerId === request.requestedBy ||
        !['chair','treasurer','secretary'].includes(review.reviewerRole) ||
        review.memberActive !== true) continue;
    if (review.decision !== 'approve' && review.decision !== 'reject') continue;
    const previous=decisions.get(review.reviewerId);
    if (previous && previous !== review.decision) return Object.freeze({eligible:false,reason:'conflicting_committee_decisions'});
    decisions.set(review.reviewerId,review.decision);
    if (review.decision === 'reject') return Object.freeze({eligible:false,reason:'committee_rejection_requires_new_review'});
  }
  const reviewers = new Set();
  for (const approval of approvals) {
    if (!approval || approval.requestId !== request.id || approval.groupId !== request.groupId || approval.decision !== 'approve' || !approval.reviewerId || approval.reviewerId === request.requestedBy || !['chair','treasurer','secretary'].includes(approval.reviewerRole) || approval.memberActive !== true) continue;
    reviewers.add(approval.reviewerId);
  }
  if (reviewers.size < requiredApprovals) return Object.freeze({eligible:false,reason:'insufficient_independent_approvals'});
  if (verifiedClearedMinor < request.amountMinor) return Object.freeze({eligible:false,reason:'insufficient_cleared_funds'});
  return Object.freeze({eligible:true,reason:'review_qualified_only_no_execution'});
}
export function contributionStatus({reportedMinor, matchedMinor, clearedMinor}={}) {
  for (const value of [reportedMinor,matchedMinor,clearedMinor]) if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('invalid_contribution_amount');
  if (clearedMinor > matchedMinor || matchedMinor > reportedMinor) throw new Error('invalid_settlement_progression');
  return Object.freeze({reportedMinor,matchedMinor,clearedMinor,outstandingVerificationMinor:reportedMinor-clearedMinor});
}
