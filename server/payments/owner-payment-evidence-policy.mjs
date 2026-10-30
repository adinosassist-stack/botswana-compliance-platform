// Pure owner-side payment verification policy. No provider calls or activation side effects.
export const PAYMENT_DECISIONS = Object.freeze({
  AWAITING_FUNDS: "awaiting_funds",
  REVIEW_REQUIRED: "review_required",
  VERIFIED: "verified",
  REJECTED: "rejected"
});

const validId = value => typeof value === "string" && value.trim().length > 0 && value.length <= 128;
const validMoney = value => Number.isSafeInteger(value) && value > 0;
const validCurrency = value => typeof value === "string" && /^[A-Z]{3}$/.test(value);

export function evaluateOwnerPaymentEvidence({tenantId, invoice, bankEvidence, reviewer, priorBankAllocations} = {}) {
  if (!validId(tenantId) || !invoice || invoice.tenantId !== tenantId ||
      !validId(invoice.id) || !validMoney(invoice.amountMinor) || !validCurrency(invoice.currency)) {
    return {decision: PAYMENT_DECISIONS.REJECTED, reason: "invalid_invoice"};
  }
  if (!bankEvidence) return {decision: PAYMENT_DECISIONS.AWAITING_FUNDS, reason: "bank_receipt_not_verified"};
  if (bankEvidence.tenantId !== tenantId || bankEvidence.invoiceId !== invoice.id ||
      bankEvidence.source !== "trusted_bank_reconciliation" || bankEvidence.status !== "settled" ||
      !validId(bankEvidence.bankTransactionId) || !validMoney(bankEvidence.amountMinor) ||
      !validCurrency(bankEvidence.currency)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "untrusted_or_incomplete_evidence"};
  }
  if (bankEvidence.amountMinor !== invoice.amountMinor || bankEvidence.currency !== invoice.currency) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "bank_amount_or_currency_mismatch"};
  }
  // Server-supplied allocation records prevent one bank credit being reused.
  // Missing allocation evidence fails closed; callers cannot provide this from the browser.
  if (!Array.isArray(priorBankAllocations)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "bank_allocation_lookup_required"};
  }
  if (priorBankAllocations.some(item => !item || !validId(item.bankTransactionId) ||
      !validId(item.invoiceId) || !validId(item.tenantId))) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "invalid_bank_allocation_record"};
  }
  if (priorBankAllocations.some(item => item.bankTransactionId === bankEvidence.bankTransactionId)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "bank_transaction_already_allocated"};
  }
  if (!reviewer || reviewer.authenticated !== true || reviewer.role !== "owner" ||
      reviewer.tenantId !== tenantId || !validId(reviewer.actorId)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "owner_review_required"};
  }
  return {decision: PAYMENT_DECISIONS.VERIFIED, reason: "settled_bank_funds_owner_verified",
    invoiceId: invoice.id, bankTransactionId: bankEvidence.bankTransactionId};
}
