import {canonicalAllocationId, validAllocationCurrency, validAllocationTimestamp}
  from './bank-allocation-input-validation.mjs';
import {evaluateOwnerPaymentEvidence, PAYMENT_DECISIONS}
  from './owner-payment-evidence-policy.mjs';
import {allocateVerifiedBankReceipt}
  from './owner-bank-allocation-contract.mjs';

// REHEARSAL ONLY: this module is not imported by a production payment route.
// The caller MUST inject a server-owned bank API/reconciliation adapter that has
// already authenticated the bank's source. Strings in a client request, CSV,
// screenshots, or owner form do not create trustworthy credit evidence.
// This module does not modify payment orders or grant subscriptions.
export async function qualifyOwnerSettledBankCredit({
  tenantId, invoice, reviewer, bankTransactionId,
  companyAccountId, orderReference, verifiedAt,
  trustedBankSource, allocationAdapter
} = {}) {
  if (!canonicalAllocationId(tenantId) || !canonicalAllocationId(invoice?.id) ||
      invoice?.tenantId !== tenantId ||
      !Number.isSafeInteger(invoice?.amountMinor) || invoice.amountMinor <= 0 ||
      invoice?.currency !== 'BWP' ||
      !canonicalAllocationId(bankTransactionId) ||
      !canonicalAllocationId(companyAccountId) ||
      !canonicalAllocationId(orderReference) ||
      !validAllocationTimestamp(verifiedAt) ||
      reviewer?.authenticated !== true || reviewer?.role !== 'owner' ||
      reviewer?.tenantId !== tenantId ||
      !canonicalAllocationId(reviewer?.actorId)) {
    return {status:'denied', reason:'invalid_owner_or_order'};
  }
  if (!trustedBankSource || typeof trustedBankSource.lookupSettledCredit !== 'function' ||
      !allocationAdapter ||
      typeof allocationAdapter.loadConflictingAllocations !== 'function' ||
      typeof allocationAdapter.insertUniqueAllocation !== 'function') {
    return {status:'unavailable', reason:'trusted_source_or_allocation_store_missing'};
  }

  let credit;
  try {
    // Only the independently authenticated bank adapter can return this.
    // Never accept a request JSON bankEvidence object as this value.
    credit = await trustedBankSource.lookupSettledCredit({
      companyAccountId, bankTransactionId
    });
  } catch {
    return {status:'unavailable', reason:'bank_source_lookup_failed'};
  }
  if (!credit) return {status:'awaiting_funds', reason:'settled_bank_credit_not_found'};
  if (credit.source !== 'trusted_bank_reconciliation' ||
      credit.status !== 'settled' ||
      credit.direction !== 'credit' || credit.final !== true ||
      credit.bankTransactionId !== bankTransactionId ||
      credit.companyAccountId !== companyAccountId ||
      credit.orderReference !== orderReference ||
      !Number.isSafeInteger(credit.amountMinor) || credit.amountMinor <= 0 ||
      !validAllocationCurrency(credit.currency) ||
      !validAllocationTimestamp(credit.settledAt) ||
      Date.parse(credit.settledAt) > Date.parse(verifiedAt)) {
    return {status:'review_required', reason:'untrusted_or_unmatched_bank_credit'};
  }
  const bankEvidence = {
    tenantId, invoiceId:invoice.id, source:credit.source,
    status:credit.status, bankTransactionId:credit.bankTransactionId,
    amountMinor:credit.amountMinor, currency:credit.currency
  };
  let priorBankAllocations;
  try {
    // Read only exact potential conflicts, then enforce uniqueness AGAIN in
    // the atomic D1 insert to close concurrent-review time-of-check races.
    priorBankAllocations = await allocationAdapter.loadConflictingAllocations({
      bankTransactionId, tenantId, invoiceId:invoice.id
    });
  } catch {
    return {status:'unavailable', reason:'bank_allocation_lookup_failed'};
  }
  const decision=evaluateOwnerPaymentEvidence({
    tenantId, invoice, reviewer, bankEvidence, priorBankAllocations
  });
  if (decision.decision !== PAYMENT_DECISIONS.VERIFIED) {
    return {status:'review_required', reason:decision.reason};
  }
  const result=await allocateVerifiedBankReceipt({
    adapter:allocationAdapter, decision, tenantId, invoice, reviewer, verifiedAt
  });
  if (result.status !== 'allocated') {
    return {status:result.status, reason:'bank_allocation_not_committed'};
  }
  // Allocated != paid. Subscription activation is a separate, protected,
  // bank-backed payment and entitlement transaction, not performed here.
  return {status:'allocated', entitlementActivated:false};
}
