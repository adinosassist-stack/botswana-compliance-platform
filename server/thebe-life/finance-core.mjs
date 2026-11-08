/**
 * Thebe Life financial foundation.
 * Pure calculations only: no payments, custody, quotes, lending decisions,
 * insurer solicitation, database access or cross-tenant reads.
 * Amounts use integer minor units (thebe) to avoid floating-point drift.
 */
export function money(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('invalid_amount_minor');
  return value;
}
export function sumAmounts(values) {
  if (!Array.isArray(values)) throw new TypeError('invalid_amounts');
  return money(values.reduce((total, value) => {
    money(value);
    const next = total + value;
    if (!Number.isSafeInteger(next)) throw new RangeError('amount_overflow');
    return next;
  }, 0));
}
export function householdSummary({income = [], expenses = [], commitments = []} = {}) {
  const incomeMinor = sumAmounts(income);
  const expensesMinor = sumAmounts(expenses);
  const commitmentsMinor = sumAmounts(commitments);
  return Object.freeze({
    incomeMinor, expensesMinor, commitmentsMinor,
    remainingMinor: incomeMinor - expensesMinor - commitmentsMinor,
    overBudget: expensesMinor + commitmentsMinor > incomeMinor
  });
}
export function motsheloProjection({members, contributionMinor, cycles, receivedMembers = 0} = {}) {
  if (!Number.isSafeInteger(members) || members < 2 || members > 10000) throw new RangeError('invalid_members');
  if (!Number.isSafeInteger(cycles) || cycles < 1 || cycles > 120) throw new RangeError('invalid_cycles');
  if (!Number.isSafeInteger(receivedMembers) || receivedMembers < 0 || receivedMembers > members) throw new RangeError('invalid_received_members');
  money(contributionMinor);
  const monthlyExpectedMinor = money(members * contributionMinor);
  const plannedContributionsMinor = money(monthlyExpectedMinor * cycles);
  const reportedReceivedMinor = money(receivedMembers * contributionMinor);
  return Object.freeze({
    monthlyExpectedMinor,
    plannedContributionsMinor,
    reportedReceivedMinor,
    outstandingMinor: monthlyExpectedMinor - reportedReceivedMinor,
    // NEVER interpret reported collections as cleared/settled funds.
    verifiedAvailableMinor: null
  });
}
export function insuranceCommissionIllustration({premiumMinor, assumedRateBasisPoints, qualifyingPolicies} = {}) {
  money(premiumMinor);
  if (!Number.isSafeInteger(assumedRateBasisPoints) || assumedRateBasisPoints < 0 || assumedRateBasisPoints > 10000) throw new RangeError('invalid_rate');
  if (!Number.isSafeInteger(qualifyingPolicies) || qualifyingPolicies < 0 || qualifyingPolicies > 1000000) throw new RangeError('invalid_policies');
  const numerator = premiumMinor * assumedRateBasisPoints * qualifyingPolicies;
  if (!Number.isSafeInteger(numerator)) throw new RangeError('amount_overflow');
  return Object.freeze({illustrativeCommissionMinor: Math.floor(numerator / 10000), earnedMinor: null, payableMinor: null});
}
