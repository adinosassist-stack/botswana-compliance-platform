# Workspace Agent: canonical runtime integration

The existing authenticated Workspace runtime already emits `thebe:workspace-ready` and `thebe:workspace-view-change`. It also contains `logoutUser()`, but does not emit a dedicated logout lifecycle event.

**Important:** `public/js/workspace-runtime-20261001b.js` must remain byte-equivalent to the canonical inline runtime. Direct edits to that extracted asset fail historical release and recovery qualification. The earlier direct runtime edits in this PR were reverted after CI proved this invariant.

A future bridge consumer should subscribe to the existing events without treating browser-dispatched events as authorization. It must verify server session and opaque identity, clear on logout/session expiry and tenant changes, and avoid automatic activation until those hooks and browser tests are implemented. Do not infer identity from DOM, URL, localStorage, or event payloads.

This PR provides regression guards and documentation only. It does not mount an Agent panel, grant permissions, perform writes, or deploy.
