# Thebe Life / Shared Workspace integration

Status: **opt-in frontend-only preview assets**. No production app route, sidebar link, customer API, bank processing, insurer activation or deployment is added.

Thebe Life must remain a first-class section of the existing Thebe Desk shell. Do not build a second sidebar, top header or AI dock. This design inherits the existing app's typography and uses the verified Thebe accent `#0b66d6`, charcoal `#111315`, shared 40–44px input/navigation targets and compact 16px cards.

## Mount only from an authenticated, authorized navigation controller

Include the scoped stylesheet `/assets/thebe-life-workspace-preview.css` and script `/js/thebe-life-workspace-preview.js` in an **authorized preview/test bundle**. When the controller has already validated the Life entitlement and created a view container within the existing Workspace content outlet:

```js
const view = document.querySelector('#thebeLifeView');
const controller = window.ThebeLifeWorkspacePreview.mount(view);
// On navigating away:
controller.destroy();
```

Never mount automatically based on URL/query-string or unauthenticated browser state. Do not treat client authorization checks as sufficient for any backend data. This demo uses local memory only and resets on navigation/reload.

- Keep personal household access, motshelo groups and insurer referrals in separate server-side authorization domains from company Workspace finance.
- Continue using the *existing* Thebe AI dock from the application shell; this preview intentionally supplies no duplicate dock.
- Implement server-side entitlements, tenant isolation, protected navigation registration, APIs, persistence, privacy consent, Botswana financial compliance and comprehensive tests **before** rollout.
- Insurance partner availability, quotes, commission recognition and money movement remain disabled.
- No migrations or production writes are performed by these assets.

## Review

Keyboard-navigate tabs and forms; test 320px mobile to desktop, screenreader labels, reduced motion, no overlapping buttons, demo-only labeling, style collisions and unchanged existing Workspace/Market appearance.
