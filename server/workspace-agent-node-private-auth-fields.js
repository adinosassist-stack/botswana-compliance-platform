// Only the explicitly enabled PRIVATE Node test profile exposes the opaque
// authenticated user ID required by the Workspace Agent shell. No email, URL,
// localStorage, request body or client-controlled identity is ever consulted.
const NODE_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function privateNodeAgentAuthIdentityFields({
  appEnv, enabled, session
}={}) {
  if (appEnv!=="test" || enabled!==true) return {};
  if (!["owner","manager"].includes(session?.role)) return {};
  if (typeof session?.user_id!=="string" || !NODE_UUID.test(session.user_id) ||
      typeof session?.tenant_id!=="string" || !NODE_UUID.test(session.tenant_id)) return {};
  return Object.freeze({id:session.user_id});
}
