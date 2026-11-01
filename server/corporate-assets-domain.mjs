/** Pure Corporate Assets domain rules. No database or external side effects. */
const STATUS = new Set(['Active','In Maintenance','Written Off','Decommissioned']);
const TRANSITIONS = Object.freeze({
  Active: new Set(['In Maintenance','Written Off','Decommissioned']),
  'In Maintenance': new Set(['Active','Written Off','Decommissioned']),
  'Written Off': new Set([]),
  Decommissioned: new Set([]),
});
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function requiredText(value, field, max = 255) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new TypeError(`invalid_${field}`);
  return value.trim();
}
function dayNumber(value) {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) throw new TypeError('invalid_date');
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== value) throw new TypeError('invalid_date');
  return Math.floor(ms / 86400000);
}
export function validateStatusChange(from, to, reason) {
  if (!STATUS.has(from) || !STATUS.has(to) || !TRANSITIONS[from].has(to)) throw new TypeError('invalid_status_transition');
  return Object.freeze({from, to, reason: requiredText(reason, 'reason', 1000)});
}
export function validateTransfer(input) {
  if (!input || typeof input !== 'object') throw new TypeError('invalid_transfer');
  const fromBranch = requiredText(input.fromBranch, 'from_branch', 100);
  const toBranch = requiredText(input.toBranch, 'to_branch', 100);
  if (fromBranch.toLocaleLowerCase('en') === toBranch.toLocaleLowerCase('en')) throw new TypeError('same_branch');
  const effectiveDate = input.effectiveDate;
  dayNumber(effectiveDate);
  return Object.freeze({fromBranch, toBranch, effectiveDate, reason: requiredText(input.reason, 'reason', 1000)});
}
export function validateMaintenance(input) {
  if (!input || typeof input !== 'object') throw new TypeError('invalid_maintenance');
  const serviceDate = input.serviceDate;
  const nextDueDate = input.nextDueDate ?? null;
  const serviceDay = dayNumber(serviceDate);
  if (nextDueDate !== null && dayNumber(nextDueDate) < serviceDay) throw new TypeError('due_before_service');
  if (typeof input.costBwp !== 'number' || !Number.isFinite(input.costBwp) || input.costBwp < 0 ||
      input.costBwp > 999999999999.99 || Math.abs(Math.round(input.costBwp*100)-input.costBwp*100) > 1e-7)
    throw new TypeError('invalid_cost');
  return Object.freeze({serviceDate, nextDueDate, costBwp: input.costBwp, description: requiredText(input.description, 'description', 2000)});
}
export function expiryState(endDate, asOfDate, warningDays = 30) {
  if (!Number.isSafeInteger(warningDays) || warningDays < 0 || warningDays > 365) throw new TypeError('invalid_warning_days');
  const remaining = dayNumber(endDate) - dayNumber(asOfDate);
  return remaining < 0 ? 'expired' : remaining <= warningDays ? 'due' : 'current';
}
