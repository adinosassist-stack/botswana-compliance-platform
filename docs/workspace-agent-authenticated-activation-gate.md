# Workspace Agent authenticated dock activation gate

Status: **not enabled**. The task API and opt-in lifecycle controller exist on the development branch, but no production page mounts the panel automatically.

## Verified integration blocker

The Node `GET /api/auth/me` response in `server/server.js` exposes `user.tenantId`, `user.email`, and `user.role`, **not an authenticated opaque user ID**. The Workspace Agent task snapshots are scoped to the server-authenticated `auth.user_id`, and the client renderer requires an exact `userId` match. Email, URL parameters, DOM attributes, localStorage, or caller-provided IDs must not substitute for that authenticated identifier.

A candidate Cloudflare agentic route, `GET /api/agentic/workspace-identity`, now returns server-authenticated opaque tenant/user identifiers for owner/manager sessions. It remains unmerged and requires authenticated integration tests. Before enabling the panel, verify a matching supported identity contract for both Node and Cloudflare transports. Prefer a dedicated same-origin authenticated read-only endpoint returning only the opaque tenant/user IDs needed by the panel, with `Cache-Control: no-store`. Review its privacy and authorization behavior before wiring it.

## Required integration sequence

1. Establish matching server-authenticated tenant and user identifiers, with no caller-controlled identity.
2. Determine the workspace from the authenticated shell's allowed workspace state, not an untrusted URL parameter.
3. Instantiate `createWorkspaceAgentTaskController` only in the Workspace dock after verified identity is available.
4. Call `controller.clear()` on logout, tenant switch, workspace switch, or session expiry; call `dispose()` on unmount.
5. Verify cancellation, delayed responses, mixed-tenant snapshots, rejected sessions, and role changes in browser-level tests.
6. Verify both direct and routed API transports and obtain independent `thusico` review before merge or deployment.

No task completion, assignment, approval, payment or external side effect may be enabled by this integration.
