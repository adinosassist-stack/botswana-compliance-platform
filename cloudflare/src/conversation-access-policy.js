// Pure fail-closed authorization kernel. No database writes or public API routes.
// The server MUST resolve this actor from an authenticated, current session.
// Do not pass user-supplied tenant, role, or membership objects into this policy.
export const CONVERSATION_POLICY_VERSION = "2026-10-30.v1";
const roleSet = new Set(["owner", "admin", "member", "viewer"]);
const id = value => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
const fixed = (value, max = 100) => typeof value === "string" && value.length > 0 && value.length <= max;

export function authorizeConversationAccess({actor, conversation, membership, operation} = {}) {
  const denied = Object.freeze({allowed:false,reason:"access_denied"});
  if (!actor || !conversation || !membership || !["read","append","delete"].includes(operation)) return denied;
  if (!id(actor.userId) || !id(actor.tenantId) || !id(conversation.tenantId) || !id(conversation.id)) return denied;
  if (!id(membership.userId) || !id(membership.tenantId) || !id(membership.conversationId)) return denied;
  if (actor.authenticated !== true || actor.active !== true || membership.active !== true) return denied;
  if (actor.userId !== membership.userId || actor.tenantId !== membership.tenantId) return denied;
  if (actor.tenantId !== conversation.tenantId || conversation.id !== membership.conversationId) return denied;
  if (conversation.status !== "active" || !roleSet.has(membership.role)) return denied;
  if ((operation === "append" || operation === "delete") && membership.role === "viewer") return denied;
  if (operation === "delete" && !["owner","admin"].includes(membership.role)) return denied;
  return Object.freeze({allowed:true,reason:"authorized"});
}

export function validateFinalConversationMessage({role,sourceKind,content,idempotencyKey} = {}) {
  const denied = Object.freeze({valid:false,reason:"invalid_message"});
  if (!["user","assistant"].includes(role)) return denied;
  if (!["typed","voice_final","assistant"].includes(sourceKind)) return denied;
  if ((role==="assistant") !== (sourceKind==="assistant")) return denied;
  if (!fixed(content,6000) || !fixed(idempotencyKey,128) || !id(idempotencyKey)) return denied;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) return denied;
  return Object.freeze({valid:true,reason:"accepted"});
}
