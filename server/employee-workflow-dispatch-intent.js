/**
 * Canonical, collision-resistant logical intent identity for a future durable
 * dispatcher. This module does not persist, claim, schedule or execute effects.
 * A transactional store must enforce uniqueness of the resulting key.
 */
const VALID = /^[A-Za-z0-9_-]{1,128}$/;
const fields = ["tenantId","proposalId","proposalRevision","action","actorId"];
export function employeeDispatchIntentIdentity(input) {
 if (!input || typeof input !== "object" || Array.isArray(input))
  throw new TypeError("invalid_dispatch_intent");
 const values = fields.map(field => {
  const value = input[field];
  if (typeof value !== "string" || !VALID.test(value))
   throw new TypeError("invalid_dispatch_"+field);
  return value;
 });
 if (!["create_internal_task","prepare_report_draft"].includes(input.action))
  throw new TypeError("unsupported_dispatch_action");
 // JSON arrays preserve field boundaries even when IDs contain separators.
 return JSON.stringify(["employee_dispatch_v1",...values]);
}
