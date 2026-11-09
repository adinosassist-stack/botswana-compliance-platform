/**
 * Thebe Life / Household: pure, offline, authorization-conscious ledger projection.
 * No persistence or account authentication is supplied by this module.
 * All amounts are integer thebe (minor BWP units).
 */
const TYPES = new Set(['income', 'expense', 'commitment', 'transfer_in', 'transfer_out']);
function requiredId(value, field) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new TypeError('invalid_' + field);
  return value;
}
function minor(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('invalid_minor_amount');
  return value;
}
export function validateHouseholdEntry(entry, householdId) {
  requiredId(householdId, 'household');
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('invalid_entry');
  const id = requiredId(entry.id, 'entry');
  if (entry.householdId !== householdId) throw new Error('household_scope_mismatch');
  if (!TYPES.has(entry.type)) throw new TypeError('invalid_entry_type');
  const amountMinor = minor(entry.amountMinor);
  if (typeof entry.occurredOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.occurredOn) || Number.isNaN(Date.parse(entry.occurredOn + 'T00:00:00Z')) || new Date(entry.occurredOn + 'T00:00:00Z').toISOString().slice(0,10) !== entry.occurredOn) throw new TypeError('invalid_date');
  if ((entry.type === 'transfer_in' || entry.type === 'transfer_out') && !entry.transferId) throw new TypeError('transfer_reference_required');
  if (entry.transferId !== undefined) requiredId(entry.transferId,'transfer');
  return Object.freeze({id, householdId, type:entry.type, amountMinor, occurredOn:entry.occurredOn, transferId:entry.transferId ?? null});
}
export function householdLedger(entries, householdId) {
  if (!Array.isArray(entries) || entries.length > 10000) throw new TypeError('invalid_entries');
  const ids = new Set();
  const totals = {incomeMinor:0, expenseMinor:0, commitmentMinor:0, transferInMinor:0, transferOutMinor:0};
  for (const raw of entries) {
    const e = validateHouseholdEntry(raw,householdId);
    if (ids.has(e.id)) throw new Error('duplicate_entry_id');
    ids.add(e.id);
    const key = {income:'incomeMinor',expense:'expenseMinor',commitment:'commitmentMinor',transfer_in:'transferInMinor',transfer_out:'transferOutMinor'}[e.type];
    const next = totals[key] + e.amountMinor;
    if (!Number.isSafeInteger(next)) throw new RangeError('amount_overflow');
    totals[key] = next;
  }
  const budgetRemainingMinor = totals.incomeMinor - totals.expenseMinor - totals.commitmentMinor;
  const cashMovementMinor = totals.incomeMinor + totals.transferInMinor - totals.expenseMinor - totals.transferOutMinor;
  if (![budgetRemainingMinor,cashMovementMinor].every(Number.isSafeInteger)) throw new RangeError('amount_overflow');
  return Object.freeze({...totals,budgetRemainingMinor,cashMovementMinor});
}
export const HOUSEHOLD_ROLES = Object.freeze(['owner','adult','viewer']);
export function canAccessHousehold({actorId, householdId, membership, action}) {
  if (!actorId || !householdId || !membership || membership.userId !== actorId || membership.householdId !== householdId || membership.status !== 'active') return false;
  if (action === 'read') return HOUSEHOLD_ROLES.includes(membership.role);
  if (action === 'write_entry') return ['owner','adult'].includes(membership.role);
  if (action === 'manage_members') return membership.role === 'owner';
  return false;
}
