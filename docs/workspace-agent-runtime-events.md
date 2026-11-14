# Workspace Agent shell lifecycle events

The authenticated Workspace runtime emits `thebe:workspace-agent-shell-state` with `detail.reason` (ready, navigation, logout, shell-hidden), `authenticated`, `role`, and `view`. These are **UI lifecycle signals**, not authorization assertions. They intentionally contain no tenant/user IDs or credentials.

A future activation adapter must map trusted runtime views to allowed Agent workspaces, verify current server session using the same-origin identity endpoint, and clear the existing `createWorkspaceAgentShellBridge` on logout, navigation, tenant changes, shell concealment and unmount. Browser-dispatched events are spoofable and MUST NOT grant permissions or authorize requests. The API remains authoritative.

This change does not mount the Agent panel, enable autonomous actions, or deploy. Activation remains gated on identity parity across Node and Cloudflare, browser testing, protected checks and independent reviewer approval.
