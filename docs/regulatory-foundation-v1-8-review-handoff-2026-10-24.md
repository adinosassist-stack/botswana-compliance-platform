# Botswana regulatory foundation v1.8 — evidence and reviewer handoff

**Date:** 24 October 2026. **Status:** Proposed code/seed changes only. **Not an approved legal determination.**

## Release 681 update — 25 November 2026 (owner local date)

**HOLD: this October handoff is historical, not authority to approve the PAYE 15-day draft.** See #2766 and the independently merged fail-closed PAYE guard #2767. The newer Income Tax Act 2026 section 138(1) has been identified in #2766 as a statutory 14-day remittance review lead, conflicting with the older BURS Payments page. A genuine independent reviewer must verify primary law, commencement, transitions, payment-month semantics, applicability and any exceptions before a current rule is approved. Do not approve the old draft or infer legal signoff from this document.

Release 681 Phase 0 audit [45740822967](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/45740822967) reports maker/checker ready, foundation v1.7 import completed, **zero verified+approved sources, zero published rules and zero open conflicts**. The regulatory gate correctly failed closed. The lifecycle audit also failed on a retired Dock microphone selector; the source repair is independent of regulatory publication.

The authorized maker must obtain the current official primary-law text and immutable verified snapshot, prepare a versioned rule with reviewed effective dates and applicable timing, preserve historical provenance, and submit it through the existing regulatory review console. A distinct authorized checker must independently verify and approve source evidence, review the candidate and publish only a legally supported rule. Recheck all five regulatory activation conditions in the existing production gate. No direct database status writes, fabricated notes, bulk approvals, gate relaxation or new production deployment are authorized by this handoff. Track source/rule approval in #1392 and #2766; the present audit repair does not complete them.

## Controlling evidence and corrections

| Topic | Previous seed v1.7 | Proposed seed v1.8 | Authority / reviewer check |
| --- | --- | --- | --- |
| PAYE monthly remittance | 15 days | 15 days, unchanged | Current BURS Payments table; original full snapshot + employer/PAYE applicability |
| VAT return/payment | 25 days (outdated BURS Payments table) | 28 days, effective-from 2026-07-01, with new ruleKey | Value Added Tax Act 2026 s54, s65, s66; SI 95/2026 commencement order; s88 transitions |
| VAT periods | Older subsidiary regulation linked | 2026 VAT Act s54 is sole controlling source for new rule | Confirm BURS-assigned category; review special nonresident/large-unregistered and approved periods before broadening |
| Industrial annual fee | Claimed indefinite + 25%, but linked to gov.bw industrial-licence page referring to annual renewal | Added distinct Ministry industrial eServices source and relinked draft rule; confidence reduced to medium | Ministry portal states indefinite validity/25% fee. Gov.bw still uses annual-renewal wording. Reconcile Industrial Development Act 2019 and Regulations 2020 and record an exception-aware legal decision before approval |
| e-Government procurement article | Marked published 2026-08-13 | Removed unverified date and active-tender claim; preserved historical provenance | Verify original Ministry record and publication date before using for current procurement readiness claims |

### Official sources

- **Primary VAT Act 2026 (BURS-hosted Gazette and Statutory Instrument 95):** https://www.burs.org.bw/index.php/tax/tax-laws-2026?download=958%3Avalue-added-tax-act-2026
- **Legacy BURS Payments table (PAYE 15 days; VAT 25 days is historical):** https://www.burs.org.bw/index.php/tax/payments
- **Ministry industrial eServices:** https://trade.gov.bw/Home/Applications?DeptId=7
- **Government industrial licence service (conflicting annual-renewal text):** https://gov.bw/trade/issuance-industrial-licence

## Publish/rollout boundaries

1. The seed and generated pack are **not** production regulatory database state. This branch makes no live source approvals, no historical record deletion, no regulatory activation and no production deployment.
2. The v1.7 legacy `bw.burs.vat.return-payment.25-days` may still exist among previously imported **draft/review** rules. **Do not approve/publish it.** A real authorised maker/checker must reject or supersede it via governed workflow. No direct D1 update or fabricated reviewer notes.
3. Do not activate a new VAT rule for a tax period that precedes the applicability confirmed by section 88 and any relevant notices. An `effectiveFrom` field is not, on its own, a substitute for full historical period transition tests.
4. A new v1.8 foundation import should only create/reuse sources and draft rules. Confirm precise behaviour and collision/version handling in an isolated environment before initiating any live import.
5. Current PAYE publication path remains independent of the VAT defect: first reviewer should re-confirm `burs-payments` full snapshot and `paye-remittance` applicability, then use genuine maker/checker sign-off.
6. A correct source hyperlink does not itself constitute a verified current snapshot. Every approval still needs official source text/provenance, effective-date validity, conflict assessment and substantive notes.
7. Re-run full governed launch checks only after independent reviewer action, source verification, at least one approved/published rule, zero unresolved blocking conflicts and separate authenticated approval checks.

## Regression evidence

- `node tests/regulatory-2026-evidence-guard.mjs`
- `node tests/v180-regulatory-pack-integrity.mjs`
- `node tests/foundation-rule-pack-static.mjs`
- `node tests/recurring-deadlines-static.mjs`
- `npm run test:release-regressions` (includes new statutory precedence guard)

All tests are code checks; none substitutes for primary legal review or authenticated user acceptance in production.

**Tracking:** #1392 governed publication; #1427 industrial/e-GP source mismatch; #1786 VAT deadline defect.
