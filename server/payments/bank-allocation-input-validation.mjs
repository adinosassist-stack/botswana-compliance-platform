// Shared fail-closed validation for server-owned reference bank allocations.
// This module is pure. It does not fetch bank evidence or authorize payment.
export const canonicalAllocationId = value =>
  typeof value === "string" &&
  value.length > 0 && value.length <= 128 &&
  value === value.trim() &&
  value.normalize("NFC") === value &&
  !/[\p{Cc}\p{Cf}]/u.test(value);

export const validAllocationCurrency = value =>
  typeof value === "string" && /^[A-Z]{3}$/.test(value);

export const validAllocationTimestamp = value =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0,19) === value.slice(0,19);
