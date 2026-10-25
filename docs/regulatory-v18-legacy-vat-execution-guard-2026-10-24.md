# Foundation v1.8: executable legacy VAT preflight and runtime guard

**Date:** 2026-10-24. **Scope:** draft code for independent review. Neither a legal signoff nor an import.

## Risk

A previously approved/published rule with the legacy Botswana VAT `25-day` tax-period offset can remain executable even after the corrected 2026 VAT Act `28-day` rule is created in draft. Source metadata reconciliation and the rule-approval gate did not, by themselves, prevent an already-published old rule from creating new tenant obligations.

## Fail-closed rules

Before the v1.8 importer makes **any** source, registry, rule, conflict or tenant write, `inspectActiveLegacyVatRules` reads existing approved/published regulatory rules. An exact 25-day VAT `rule_key`, or a `vat_category_period` rule with `dueDaysAfterPeriodEnd=25`, blocks import if it is not provably bounded to before **2026-07-01**. Invalid `effective_to` values fail closed.

The server returns `legacy_vat_rule_active_requires_review` (HTTP 409), with a read-only summary of affected rule IDs, keys and statuses. `GET /api/platform/regulatory/foundation-pack?preflight=1` includes a separate `legacyVat` section and an aggregate failed `preflight.ok` flag. The existing reviewer panel shows these blockers alongside source metadata drift. It does not expose an approval, retirement or bulk-import button.

The execution paths `evaluateRuleForTenant` and `materializeRecurringRule` also reject obsolete 25-day VAT definitions before creating new obligations—even if one unexpectedly remains published. **No existing obligations are deleted, rescheduled or silently marked complete.** Their disposition requires a separately audited remediation process.

Previously published but explicitly ended historical rules (`effective_to` before 2026-07-01) do **not** block importing the corrected draft; their 25-day definition is still prevented from generating *new* obligations through the current runtime.

## Human release requirements

1. Independent code review and release-regression CI.
2. Authenticated actual staging Cloudflare D1 read-only preflight, followed by staged v1.7→v1.8 import rehearsal only on segregated test data.
3. If any old VAT rule is approved/published for current periods, an authorised maker and independent checker must document legal disposition and a governed retirement/supersession path. The code never impersonates them.
4. Read-only inventory of already-created tenant obligations from such rules. Review existing obligations with customer and legal context; do not bulk delete or rewrite due dates.
5. Official source snapshot/legal approval, independent rule signoff and a separate explicit production activation decision.

## Evidence

Tests cover invalid historical cutoffs, legacy key and alternate 25-day action, all applicable statuses, actual full-schema importer blocking before any mutation, historical-only exception, GET-only UI visualization, and zero new runtime obligations. Release tests remain fail-closed.

Related: #1788, #1791 and governing #1392. **No live import, approval, or production deployment is performed.**
