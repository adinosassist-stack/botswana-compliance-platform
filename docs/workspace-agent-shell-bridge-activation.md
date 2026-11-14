# Authenticated Workspace Agent shell bridge

The shell can import `createWorkspaceAgentShellBridge` from `/js/workspace-agent-shell-bridge.js`. This is an **explicit opt-in adapter**, not a page bootstrap or production activation.

After the existing shell has confirmed a valid server-authenticated session and resolved an allowed workspace from its own authorized state, call `bridge.activate({ authenticated: true, workspace })`. The bridge itself requests opaque tenant/user identifiers from the same-origin authenticated API. Do not pass identity from email, DOM, query parameters, or local storage.

Create with `{ getDock: () => document.getElementById("thebeAiDock") }`. Call `onLogout`, `onSessionExpired`, `onTenantChanged`, `onWorkspaceChanged`, or `onDockUnmount` **before** changing the corresponding shell state. Call `dispose` on shell teardown. Recreate/activate only after the new session and workspace are authorized.

Before any live activation: confirm that both Node and Cloudflare API transports implement the same opaque identity and task contracts; integrate the bridge with the real authenticated shell's lifecycle events; test in a browser with a valid authorized session and a rejected/expired session; verify tenant isolation, stale response cancellation, no UI overlap, and no payment/task side effects. Obtain independent `thusico` review and all protected release approvals.

This change introduces no automatic mount, API writes, traffic shift, schema changes, or production deployment.
