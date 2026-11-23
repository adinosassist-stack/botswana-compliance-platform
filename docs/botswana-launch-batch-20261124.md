# Botswana launch batch — 24 November 2026

Central tracker: #2735. Target: 1 December 2026, conditional on evidence and approvals. APK expansion and Namibia remain on hold.

## Source changes

AI credit purchase #2843 previously opened hosted checkout, while manual submission and platform review accepted subscriptions only. Credit checkout now returns manual bank instructions, reuses an eligible pending pack order, and creates a new order after rejection. Owner-only submission and platform billing review accept both order types. Settlement still requires independent confirmation of settled funds, exact amount and a bank-issued transaction ID distinct from the customer reference. Credit approval additionally checks the paid order, applied fulfillment, tenant wallet and matching purchase ledger before acknowledging activation. Existing subscription verification remains intact.

The frontend shares the manual-transfer view between subscriptions and credits, scopes reference fields by order, prevents duplicate credit-checkout clicks, and ignores responses after a session change. Admin review labels distinguish credits from subscription plans.

Onboarding #2781: allow the milestone heading to wrap within a narrow card. The synthetic mobile matrix now checks heading text-fragment bounds, not just element bounds. This does not prove native Android browser zoom.

Approved Aura implementation is already present in baseline main `af3b87896326a1bace886de60200934fd340d851` (Release 664 manifest, source `c319aa48d756c6f7486a669621d46cef6574d798`). This batch preserves it.

## Evidence and limits

- 456 integrated Node tests passed before the final two additional credit cases; all 13 credit cases subsequently passed. Includes real local SQLite payment SQL and disposable Miniflare D1 subscription/audit tests.
- 45 Aura source, owner dashboard and core-only release-boundary tests passed.
- `npm run check`, frontend syntax, bundle budget (534 checks), workspace canonical/external runtime parity and subscription adversarial checks passed.
- Reproduction on baseline: credit checkout omitted manual instructions, ignored unavailable bank configuration and rejected credit reference submission (three failing assertions). These pass after repair.
- Local browser execution is blocked: installed Chromium launcher lacks its binary; official browser download returned HTTP 403. New heading geometry assertion awaits exact-head CI. Synthetic browser evidence and physical Android acceptance are distinct.
- Live workspace navigation reached sign-in; no authenticated customer/Owner/Manager acceptance was performed.
- `node scripts/launch-gate.mjs` fails because `audit-report.json` is missing. No launch verdict or BF-07 evidence is fabricated.
- No bank transfer, credit adjustment, subscription activation, remote SQL, migration, feature activation, merge or deployment was performed.

## Remaining release gates

| Gate | Required evidence / decision |
| --- | --- |
| Source candidate | Exact PR head CI, independent thusico review, resolved threads and protected merge |
| AI credits and subscriptions #2843 / #1874 | Authenticated customer purchase, independent company-bank settled credit, owner review and durable allocation/access after refresh and a new session |
| Legal #2413 | Verified contracting entity and public particulars, approved Terms/Privacy/payment/refund disclosures; source still has legal-identity placeholder |
| Customer consent #2695 | Qualified isolated recovery/retention/operator identity; fresh resource/checksum/SHA-specific operational approvals and authenticated issuance/consent proof |
| Invoice staging #2670 | Qualified isolated execution credential, retention/recovery/audit proof, separate exact-source schema and subsequent canary approvals |
| Web UI #2781 / #2715 / #2835 | Signed-in Owner/Manager Android Chrome: reference orb, audio response, notification text/actions, dragging/persistence, keyboard/nav and native 200% zoom |
| Production | Fresh protected main and cumulative delta, manifest-only release candidate, exact-SHA CI/recovery/BF-07 seal, separate owner production authorization and independent environment approval; postdeploy verification |

Suggested sequencing: finish CI/review and staging prerequisites by 26 November; evaluate a limited pilot on 27 November only if the applicable gates pass; complete production qualification and Android acceptance by 30 November. Proceed with 1 December paid launch only after all applicable P0 gates close. These are conditional milestones, not operational approvals.
