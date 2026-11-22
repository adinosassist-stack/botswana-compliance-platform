import {canonicalAllocationId,validAllocationTimestamp} from "./bank-allocation-input-validation.mjs";
// Pure owner-side payment verification policy. No provider calls or activation side effects.
export const PAYMENT_DECISIONS = Object.freeze({
  AWAITING_FUNDS: "awaiting_funds",
  REVIEW_REQUIRED: "review_required",
  VERIFIED: "verified",
  REJECTED: "rejected"
});

// Bank, tenant, invoice and reviewer IDs are audit/equality keys and must
// share one visible, NFC-canonical, control-free input validation policy.
const validId = canonicalAllocationId;
const validBankTransactionId = canonicalAllocationId;
const validMoney = value => Number.isSafeInteger(value) && value > 0;
const validCurrency = value => typeof value === "string" && /^[A-Z]{3}$/.test(value);

export function evaluateOwnerPaymentEvidence({tenantId, invoice, bankEvidence, reviewer, priorBankAllocations, companyAccount, asOf} = {}) {
  if (!validId(tenantId) || !invoice || invoice.tenantId !== tenantId ||
      !validId(invoice.id) || !validMoney(invoice.amountMinor) || !validCurrency(invoice.currency)) {
    return {decision: PAYMENT_DECISIONS.REJECTED, reason: "invalid_invoice"};
  }
  if (!bankEvidence) return {decision: PAYMENT_DECISIONS.AWAITING_FUNDS, reason: "bank_receipt_not_verified"};
  if (bankEvidence.tenantId !== tenantId || bankEvidence.invoiceId !== invoice.id ||
      bankEvidence.source !== "trusted_bank_reconciliation" || bankEvidence.status !== "settled" ||
      !validBankTransactionId(bankEvidence.bankTransactionId) || !validMoney(bankEvidence.amountMinor) ||
      !validCurrency(bankEvidence.currency)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "untrusted_or_incomplete_evidence"};
  }
  if (bankEvidence.amountMinor !== invoice.amountMinor || bankEvidence.currency !== invoice.currency) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "bank_amount_or_currency_mismatch"};
  }
  // Structural flags are not proof of a bank credit. These must be supplied
  // only by an independently authenticated company-bank review adapter.
  // A "settled" label alone cannot qualify a reversal, chargeback or future credit.
  if (bankEvidence.finality !== "confirmed" ||
      bankEvidence.reversed !== false || bankEvidence.chargeback !== false ||
      bankEvidence.reversalPending !== false ||
      !validAllocationTimestamp(bankEvidence.settledAt) ||
      !validAllocationTimestamp(bankEvidence.observedAt) ||
      !validAllocationTimestamp(asOf) ||
      Date.parse(bankEvidence.settledAt) > Date.parse(bankEvidence.observedAt) ||
      Date.parse(bankEvidence.observedAt) > Date.parse(asOf)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "bank_settlement_not_final"};
  }
  if (!companyAccount || companyAccount.ownerVerified !== true ||
      !validBankTransactionId(companyAccount.accountKey) ||
      companyAccount.currency !== "BWP" ||
      invoice.currency !== "BWP" ||
      !validBankTransactionId(bankEvidence.accountKey) ||
      bankEvidence.accountKey !== companyAccount.accountKey) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "company_bank_account_unverified"};
  }
  // Server-supplied allocation records prevent one bank credit being reused.
  // Missing allocation evidence fails closed; callers cannot provide this from the browser.
  if (!Array.isArray(priorBankAllocations)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "bank_allocation_lookup_required"};
  }
  if (priorBankAllocations.some(item => !item || !validBankTransactionId(item.bankTransactionId) ||
      !validId(item.invoiceId) || !validId(item.tenantId))) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "invalid_bank_allocation_record"};
  }
  if (priorBankAllocations.some(item => item.bankTransactionId === bankEvidence.bankTransactionId)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "bank_transaction_already_allocated"};
  }
  // The current full-invoice allocation contract does not support split credits.
  // Different bank transfers must not satisfy the same already-funded invoice twice.
  // This is an advisory fail-closed check; DB unique constraints remain authoritative.
  if (priorBankAllocations.some(item => item.invoiceId === invoice.id && item.tenantId === tenantId)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "invoice_already_allocated"};
  }
  if (!reviewer || reviewer.authenticated !== true || reviewer.role !== "owner" ||
      reviewer.tenantId !== tenantId || !validId(reviewer.actorId)) {
    return {decision: PAYMENT_DECISIONS.REVIEW_REQUIRED, reason: "owner_review_required"};
  }
  return {decision: PAYMENT_DECISIONS.VERIFIED, reason: "settled_bank_funds_owner_verified",
    invoiceId: invoice.id, bankTransactionId: bankEvidence.bankTransactionId};
}
