# Workspace Agent — earliest Cloudflare ingress rejection

**Review-only source hardening; no remote Cloudflare changes, version upload, deployment, D1/PostgreSQL migration, Access provisioning or feature activation.**

## Additional risk closed
The staging-only read-only Agent API policy introduced in PR #2438 was invoked inside the Agentic route chain, after earlier voice, WhatsApp, autonomy, task and other handlers. Those handlers did not intentionally own the Agent advisory paths, but placing a sensitive-path guard after unrelated handlers creates a future bypass risk if a dispatcher starts claiming the same URL.

This batch invokes `denyUnqualifiedWorkspaceAgentApi({env,request,logicalPath})` at the **outermost `cloudflare/src/agentic-entry.js` fetch** before paused-write authentication, report attachment middleware, or any Agent route dispatcher. Both the exact identity and advisory-task paths are denied in production and in staging without explicit flag + pinned exact HTTPS hostname + direct GET. A denied request returns a no-store, nosniff 404. Tunneled logical paths are rejected even if their logical target matches a privileged route.

The existing inner check before `handleWorkspaceAgentTasksRequest` remains in place as defense-in-depth. An allowed staging request is **not** an authenticated request: the existing cookie/session, active membership, owner/manager role, and tenant-scoped SELECT remain mandatory. The outer guard does not enable or create staging ingress.

## Tests
- `tests/workspace-agent-early-ingress-denial.test.mjs` imports and calls the real `agentic-entry.js` default fetch, with a hostile synthetic environment that throws if DB, secret or payment config are accessed. Production GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD for identity/task paths must uniformly produce 404 **before** reaching any service.
- Explicit staging flag/hostname mismatches, apex/HTTP requests and alternate logical-path tunnels are denied at the top-level entry.
- A genuine configured staging request passes only the *ingress* gate; it still cannot authorize a session or perform task actions.
- Offline qualification source fingerprint now requires the early call to precede all other runtime dispatch and fails static safety evaluation if the guard or placement disappears.

No secret values, customers, real Cloudflare environment, database, DNS/Access policy or live business data are used in these tests. Production remains unchanged unless separately deployed after formal release approval; protected `thusico` review still required for merging source.
