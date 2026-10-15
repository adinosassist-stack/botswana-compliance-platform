import { createHash, timingSafeEqual } from "node:crypto";

const SENSITIVE = new Set(["money.transfer","finance.post","payroll.run","tax.submit","regulatory.file","record.delete","access.change","message.send"]);
export const SENSITIVE_AGENT_ACTIONS = Object.freeze([...SENSITIVE]);

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
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
  if (!Number.isFinite(policy.remainingBudget) || policy.remainingBudget < 0 || !Number.isFinite(policy.estimatedCost) || policy.estimatedCost < 0 || policy.estimatedCost > policy.remainingBudget) return { allowed: false, reason: "budget_exceeded" };
  if (!SENSITIVE.has(action)) return { allowed: true, reason: "read_or_draft_only" };
  if (!approval || !approval.id || !approval.nonce || approval.consumed !== false || approval.status !== "approved") return { allowed: false, reason: "approval_required" };
  if (!equal(approval.tenantId, context.tenantId) || !equal(approval.actorId, context.actorId) || !equal(approval.action, action) || !equal(approval.argumentDigest, agentArgumentDigest(args))) return { allowed: false, reason: "approval_scope_mismatch" };
  if (!Number.isFinite(approval.expiresAt) || !Number.isFinite(context.now) || approval.expiresAt <= context.now) return { allowed: false, reason: "approval_expired" };
  return { allowed: true, reason: "approval_valid_requires_atomic_consumption" };
}
