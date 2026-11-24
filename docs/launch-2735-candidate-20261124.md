# Botswana launch candidate — 24 November 2026

Tracker: #2735. Local source consolidation based on #2851; no protected merge, deploy, live entitlement, payment activation, or remote database operation. APK and Namibia remain held.

## Source and scope

Base main: `c5fd64e39b8af306e7821d16107e51d9c619efc9`.
Reused founder candidate: `514621d22c44779ffd32f7ebe4aecee90cccfa26`.
The final source identity is the resulting PR head; use its fresh CI and review, not the earlier founder head's green runs.

- Retains the reviewed implementation proposal for immutable-user/active-owner founder chat entitlement, zero-credit audited usage, isolation, failure handling, and inspect-only grant/revoke helper. The live entitlement is not granted. Synthetic voice coverage does not establish real microphone/provider acceptance.
- Repairs wallet responses crossing a session or in-place tenant change, reverse-order refreshes, duplicate manual reference submission, retry after failure, and late submission success/error after leaving the account. Submission remains awaiting settled-funds verification and never activates credits or plans itself.
- Reuses the neutral composer proposal from #2790 over current merged Aura source. Retains keyboard focus feedback; adds computed-style assertions to the combined synthetic notification/Aura Chromium matrix.
- Preserves #2844's stronger settled-credit/idempotency/rollback implementation already on main. #2845's older backend/UI patch was compared and was not replayed over newer source. Its remaining checkout-session concerns are covered here; authenticated settlement and new-session acceptance remain open.
- Keeps canonical inline and external workspace runtime identical and within the existing 550,000-byte cap. Removes duplicate balance/allowance copy from the wallet summary (dedicated metrics remain) and shares owner/read-only pack markup. No budget increase.

## Fresh evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| Wallet session/order safety and manual submission retry | `node --test tests/launch-billing-session-2735.test.mjs` | Seven cases pass; five original reproductions failed before repair |
| Founder, credit checkout, settlement, rollback, onboarding, notification/pill | Integrated Node selection recorded in PR | 133 tests pass, no skipped/cancelled tests; includes disposable local D1 |
| Syntax and employee surface | `npm run check` | Pass (16 employee tests plus syntax) |
| Production lint / route security | `npm run lint:production` | 1,261 checks pass; 293 authenticated branches classified |
| Production hardening | `npm run test:production-hardening` | 292 checks pass |
| Canonical/external runtime and asset budgets | `npm run check:bundle-budget` | 534 checks pass after consolidation; no threshold changes |
| Combined notification/Aura computed styles | `node tests/combined-mobile-notification-aura-browser-2813.mjs` | Environment blocked: Chromium process singleton socket denied with EPERM before page execution; exact-head Chromium CI required |
| Full regression | `npm test` | Pass, exit 0; includes historical release regressions, runtime parity, recovery and core-only release controls |
| Release seal | `node scripts/launch-gate.mjs` | HOLD: missing `audit-report.json`; no synthetic BF-07 seal substituted |

## Read-only production and legal check

Live `/api/version` returned Release 666, source `cab0156d7d661e386d50d9f9678aa9f74359aa6d`. Live `/terms/` contains the operator wording approved in #2413 and published by #2847. The old identity-placeholder assertion in the tracker is superseded.

Live `/privacy/` still says verified legal-entity, data-residency, provider and privacy-contact disclosures are being formalised. Terms still show the 14 October 2026 update date and do not establish approved versioned payment/refund disclosures. Operator publication alone does not close #2413. No legal text or entity claim was invented or changed in this batch.

## Remaining gates and promotion sequence

1. Fresh CI on the final consolidated head, independent `thusico` review, resolved threads, then protected merge under existing controls. Earlier founder-head CI cannot qualify this changed candidate.
2. Authenticated bank-backed payment/credit and subscription acceptance across refresh and a new session (#2843/#1874); live founder grant and real chat/voice verification require the bounded production-write process after approved source deployment.
3. Signed-in physical Android Owner/Manager acceptance: notification actions/drag/persistence, compact completed onboarding, approved orb and real audio, keyboard/nav clearance, 200% native zoom. Synthetic source tests do not close this.
4. Remaining versioned public disclosure acceptance (#2413); isolated consent/invoice/logo qualifications retain their resource/checksum/operator/retention/recovery and approval gates.
5. After protected merge, derive a fresh exact-main production manifest and cumulative delta, obtain genuine audit/recovery/BF-07 artifacts, separate exact-SHA production authorization and independent environment approval, then deploy and verify.

This is a prepared source candidate. A sealed production candidate cannot honestly be issued before protected merge and genuine release evidence. The 1 December launch remains conditional.

## Publication status

Automatic approval review rejected the attempt to push this local source/workflow update to `fix/founder-ai-no-deduction`: remote publication was not considered explicitly authorized. The remote PR was not updated. Explicit user authorization to push the prepared candidate is required before remote exact-head CI and independent review can begin. No alternate publishing route was used.

The candidate is available as a local Git commit and a complete base-to-candidate patch. It is not a sealed or deployed production release.
