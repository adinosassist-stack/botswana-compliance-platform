# Workspace Agent event adapter (not production enabled)

Import `createWorkspaceAgentEventAdapter` from `/js/workspace-agent-event-adapter.js` in the **trusted authenticated shell**, and explicitly call `activateFromTrustedShell({authenticated:true,workspace})` only after resolving a permitted workspace from authenticated server state. The adapter delegates identity verification to the existing same-origin Workspace Agent identity endpoint.

The adapter listens for existing `thebe:workspace-view-change` and `pagehide` events and optionally the future `thebe:workspace-agent-shell-state` event, solely to clear cached identity/tasks. **No browser event can activate the Agent.** The canonical Workspace runtime remains untouched. The authenticated shell must additionally call `clear()` on logout, session expiry and tenant switch; those transitions are not yet wired here.

This PR does not import the adapter into the live shell, mount UI, deploy, grant autonomous execution or perform writes. Protected checks, browser testing, explicit shell integration and independent review remain mandatory.
