# AI Dock completion batch — #1898

This branch tracks a consolidated, review-first finish of the existing dock. It does not activate exports or modify production runtime.

## Batch A: existing UI
- Reconcile #1712, #1861, #1576 and #1348 against the latest main, preserving current chat, voice and file-picker behavior.
- Remove preset prompt chips; maintain one composer with +, microphone and send, accessible focus states and concise errors.
- Keep desktop dock within reserved workspace rail; bounded resizing and dragging must not obscure workspace actions.
- Validate mobile keyboard, viewport insets and narrow screens.

## Batch B: persistence and sharing
- Scope history and attachment access to authorized tenant and actor.
- Share only by explicitly permission-checked revocable links, never by default.
- Test logout, permission revocation, cross-tenant requests, expired links and failed uploads.

## Batch C: qualification
- Add Chromium/Playwright contracts for keyboard, voice transition, attachment limits, mobile viewport, desktop geometry and reconnect.
- Run npm test, npm run check and protected required CI at exact PR head.
- Independent review by thusico; no branch protection bypass.

## Explicit exclusions
PDF/DOCX/PPTX exports stay OFF pending #1868 and renderer/security approval. No regulatory activation, production push or changes to customer data.

## Completion evidence required
Record test run URLs, exact commit SHA, independent approval, deployed release SHA, and actual browser screenshots before closing #1898.
