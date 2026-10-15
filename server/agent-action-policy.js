import { createHash, timingSafeEqual } from "node:crypto";

const SENSITIVE = new Set(["money.transfer","finance.post","payroll.run","tax.submit","regulatory.file","record.delete","access.change","message.send"]);
const SAFE = new Set(["invoice.draft","compliance.read","finance.read","operations.read","compliance.reminder.draft","reconciliation.suggest","onboarding.exceptions.read"]);
export const SAFE_AGENT_ACTIONS = Object.freeze([...SAFE]);
export const SENSITIVE_AGENT_ACTIONS = Object.freeze([...SENSITIVE]);

export function canonicalJson(value) {
  // Reject values that cannot be represented consistently as JSON.
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non_json_argument");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("non_json_argument");
  const keys = Object.keys(value).sort();
  return "{" + keys.map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}

export function agentArgumentDigest(args) {
  return createHash("sha256").update(canonicalJson(args)).digest("hex");
}

function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

/**
 * Pure fail-closed decision function. Callers MUST atomically consume approval
 * nonce in durable storage and append an audit event before executing a tool.
 * No model-generated input may set trusted identity, approval or policy flags.
 */
export function evaluateAgentAction({ action, args, context, approval, policy }) {
  if (!policy?.enabled || policy?.killSwitch || !policy?.auditAvailable) return { allowed: false, reason: "governance_unavailable" };
  if (!context?.tenantId || !context?.actorId || !Array.isArray(policy.allowedActions) || !policy.allowedActions.includes(action)) return { allowed: false, reason: "unauthorized_action" };
  if (!Number.isFinite(context?.now)) return { allowed: false, reason: "invalid_server_time" };
  if (!Number.isFinite(policy.remainingBudget) || policy.remainingBudget < 0 || !Number.isFinite(policy.estimatedCost) || policy.estimatedCost < 0 || policy.estimatedCost > policy.remainingBudget) return { allowed: false, reason: "budget_exceeded" };
  if (SAFE.has(action)) return { allowed: true, reason: "read_or_draft_only" };
  if (!SENSITIVE.has(action)) return { allowed: false, reason: "unclassified_action" };
  if (!approval || !approval.id || !approval.nonce || approval.consumed !== false || approval.status !== "approved") return { allowed: false, reason: "approval_required" };
  if (!equal(approval.tenantId, context.tenantId) || !equal(approval.actorId, context.actorId) || !equal(approval.action, action) || !equal(approval.argumentDigest, agentArgumentDigest(args))) return { allowed: false, reason: "approval_scope_mismatch" };
  if (!Number.isFinite(approval.expiresAt) || !Number.isFinite(context.now) || approval.expiresAt <= context.now) return { allowed: false, reason: "approval_expired" };
  return { allowed: true, reason: "approval_valid_requires_atomic_consumption" };
}
