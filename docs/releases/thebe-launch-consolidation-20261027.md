# Thebe Desk — consolidated launch qualification batch (27 October 2026)

Status: review candidate only. No deployment or activation.

## AI Dock integration
- Compare PRs #1712, #1480, #1472, #1861, #1348, #1475, and #1576 against the current main branch. Preserve current composer and workspace behavior, avoid wholesale cherry-picks or stale HTML/runtime replacements.
- Confirm: no preset questions; compact chat-first UI; accessible plus/file, microphone, send and share actions; adjustable width and movable dock; keyboard, mobile safe-area, focus, and no-overlap tests.
- Export dependency chain: #1866, #1867, #1870, #1873; require independent review, current-head CI, D1/R2 isolation, authorization at create and download, bounded quotas and retention, production dependency provenance, and staging tests. Exports remain OFF until all gates pass.

## Owner command centre
- Verify owner-only authorization server-side, with no email-string or local-storage shortcut.
- Show direct payment queue, verified/unverified states, tenant/customer, plan, amount, timestamp and reconciliation evidence.
- Implement explicit guarded activate/deactivate switches with audit trail, idempotency, permission checks, and payment-provider verification; never activate on client-side payment display alone.
- Test owner sign-in, subscriptions, failed payments, duplicate callbacks, tenant isolation, and mobile dashboard rendering.

## Release gates
1. Build on current main, preserve identical runtime/inline copies where applicable.
2. Run focused tests plus required governance, recovery and security checks at exact PR head.
3. Independent reviewer thusico signs off; no self-approval or branch protection bypass.
4. Staging-only end-to-end verification before any production release.
5. Regulatory staging and production activation remain separate explicit approvals.

## Delivery order
A. Dock visual consolidation (no AI activation).
B. Owner dashboard and payment verification workflow.
C. Private exports with supply-chain/security qualification.
D. Release evidence and deployment decision.
