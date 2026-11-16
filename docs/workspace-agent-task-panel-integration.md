# Workspace Agent task panel integration (draft PR #2419)

The task planning, view adapter and renderer are advisory-only building blocks. They are not automatically imported by the existing dock, and there is currently no production task endpoint wired to this panel.

## Required integration

1. Authenticate the request on the server and resolve the active tenant, user, workspace, role and permitted source references. Never trust these values from client-supplied JSON.
2. Build a tenant-scoped task snapshot from server-authorized observations. Re-check permissions at every fetch and never return cross-tenant tasks.
3. Import `renderWorkspaceAgentTasks` into the existing dock integration once a compatible, verified API is available.
4. Call the renderer with `{dock, snapshot, identity}` only after server authorization. Clear the panel on logout, tenant switch, user switch, or workspace change; never reuse cached data across identities.
5. Keep the existing Runtime Guard authoritative. Task status, UI review labels and client flags must never approve or execute actions.
6. Add browser DOM tests, authenticated endpoint isolation tests, CI verification, and independent reviewer approval before enabling the integration.

## Security limitations

The view adapter's client-side tenant/user/workspace filtering is a defense-in-depth display filter, **not** an access-control boundary. A client can manipulate a snapshot. The server must authorize every read and action. The task planner is not a durable queue; it does not persist progress or provide idempotent retries. The task completion transition is deliberately unavailable until a trusted evidence-bound server workflow exists.

No production deployment, schema migration, traffic shift, payment action or autonomous execution is included in this PR.
