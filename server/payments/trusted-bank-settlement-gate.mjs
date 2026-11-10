import {canonicalAllocationId, validAllocationTimestamp} from "./bank-allocation-input-validation.mjs";

// OFFLINE / REFERENCE ONLY. This structural gate is not a bank connector,
// proof of funds, payment approval, allocation, or subscription activation.
// Only a backend-authenticated bank source may construct the evidence object.
// In particular, never pass public JSON/CSV/owner attestations directly here.
const deny = reason => ({eligible:false,reason});
const validMoney = value => Number.isSafeInteger(value) && value > 0;
const exactKeys = (a,b) => typeof a === "string" && typeof b === "string" && a === b;
export function assessTrustedBankSettlement({invoice,bankCredit,companyAccount,asOf}={}) {
  if (!invoice || !canonicalAllocationId(invoice.tenantId) ||
      !canonicalAllocationId(invoice.id) || !validMoney(invoice.amountMinor) ||
      invoice.currency !== "BWP" || !canonicalAllocationId(invoice.reference)) {
    return deny("invalid_invoice");
  }
  if (!companyAccount || !canonicalAllocationId(companyAccount.accountKey) ||
      companyAccount.currency !== "BWP" || companyAccount.ownerVerified !== true) {
    return deny("company_account_not_authorized");
  }
  if (!validAllocationTimestamp(asOf)) return deny("invalid_observation_time");
  if (!bankCredit) return deny("bank_credit_unavailable");
  if (bankCredit.origin !== "authenticated_company_bank_source" ||
      bankCredit.sourceAuthenticated !== true ||
      bankCredit.sourceType !== "read_only_bank_transaction" ||
      !canonicalAllocationId(bankCredit.bankTransactionId) ||
      !canonicalAllocationId(bankCredit.accountKey) ||
      !canonicalAllocationId(bankCredit.reference) ||
      !validAllocationTimestamp(bankCredit.settledAt)) {
    return deny("untrusted_or_incomplete_bank_credit");
  }
  if (!exactKeys(bankCredit.accountKey,companyAccount.accountKey))
    return deny("company_account_mismatch");
  if (!exactKeys(bankCredit.reference,invoice.reference))
    return deny("bank_reference_mismatch");
  if (bankCredit.direction !== "credit" || bankCredit.status !== "settled" ||
      bankCredit.finality !== "confirmed" || bankCredit.reversed === true ||
      bankCredit.chargeback === true || bankCredit.reversalPending === true) {
    return deny("bank_credit_not_final");
  }
  if (!validMoney(bankCredit.amountMinor) || bankCredit.currency !== "BWP" ||
      bankCredit.amountMinor !== invoice.amountMinor) {
    return deny("bank_amount_or_currency_mismatch");
  }
  if (Date.parse(bankCredit.settledAt) > Date.parse(asOf))
    return deny("future_bank_settlement");
  // A successful decision is only a structural eligibility result. Database
  // global transaction-ID uniqueness, owner auth, immutable bank provenance,
  // reversal handling, atomic allocation, and activation are separate gates.
  return {eligible:true,reason:"structural_bank_credit_match",
    bankTransactionId:bankCredit.bankTransactionId,invoiceId:invoice.id,tenantId:invoice.tenantId};
}
