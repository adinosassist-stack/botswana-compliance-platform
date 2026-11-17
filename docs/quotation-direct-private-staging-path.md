# Quotation direct private-staging path — review proposal

**Status:** Proposed release-plan change. Source/documentation only. **NOT authorization to upload, deploy, execute, alter bindings, write data or issue quotations.**

## Decision sought

Remove the *optional* `bw-quotation-synthetic-caller-staging`, `bw-quotation-private-workflow-harness` and `bw-quotation-private-rehearsal` Workflow from the **mandatory release path**. Leave these isolated records inactive; do not delete or expose them. This does **not** waive private end-to-end staging testing or allow a direct production launch.

Owner and independent reviewer `thusico` must separately accept an equivalent **direct authenticated private staging test plan** before relying on it. The earlier `PRIVATE_QUOTATION_VERSION_ONLY_NO_EXECUTION` approval does not approve this alternative or a customer-facing release.

## Existing evidence that can be reused

- The service has implemented editable customers/items/discounts, save/reopen with optimistic conflict handling, tenant-scoped draft storage, PDF preview, logo controls, CSRF and role denial contracts, and synthetic in-memory private pipeline tests.
- The isolated quotation D1 migrations already ran once; **never rerun them**. The source of record for schema scope and state is issue #2504.
- Offline independent qualification of the optional caller and harness passed on main: GitHub Actions run [#44091445333](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/44091445333). This is not a deployed runtime test.
- The two optional Worker records have **zero versions and deployments**, and their public and preview subdomains are disabled. The Workflow is not registered; its absence need not block a separately approved direct staging approach.

## Direct protected staging acceptance — required before any production release

1. **Owner-facing PDF acceptance:** Confirm the actual final two-page Lovely quotation, legal issuer, both pages of terms, print layout, footers, bank/payment instructions in private, and exact SHA-256. Obtain appropriate Botswana commercial/legal review; no owner instruction can waive statutory requirements. Track in issue #2542.
2. **Template registration:** Obtain distinct owner and `thusico` approval for the exact private template binary, R2 bucket `bw-quotation-template-private-staging`, tenant-scoped key and final SHA; upload only through an expressly authorized operation. No public object URL.
3. **Service configuration and authority:** Independent review of the **actual** `bw-quotation-auth-private-staging` Worker version, tested identity/session and anti-CSRF integration, exact D1 resources, private R2, credential names (not values), no public routes, no workers.dev, no version preview URLs, no schedules and full rollback. Pin the executable hash to the final reviewed source. No caller/harness is required for this plan.
4. **Alternative execution route:** An approved operator uses an authenticated and isolated private staging application/session, with synthetic tenant accounts, to exercise the real quotation service directly. Do not invent a public debugging route or treat a static header as sufficient identity. Identify the exact private invocation/access mechanism and review it **before** any activation.
5. **Staging evidence:** Persist a synthetic draft, reopen it, edit items and verify BWP totals, demonstrate revision conflict, render both PDF pages, verify private template/logo position, and prove negative controls for anonymous, role, wrong-tenant and invalid-CSRF attempts. Verify no issuance during preview, private D1/R2 boundaries and no external customer records. Capture structured redacted receipts.
6. **Recovery:** Demonstrate a scoped restore/reversal on isolated synthetic resources, not merely a D1 time-travel bookmark. Record before/after counts, checkpoint, reviewer and cleanup.
7. **Production decision:** Independent `thusico` review plus separate owner authorization of the exact production release and post-deployment verification. No public quotation issuance until every above gate is met.

## Explicit release blockers and owners

| Gate | Owner/reviewer | State |
| --- | --- | --- |
| Remove optional harness from **critical path**, subject to equivalent private tests | Owner + independent thusico | **Proposed; not approved** |
| Final 2-page PDF, legal/commercial terms, issuer, exact SHA | Business owner + qualified reviewer | **Pending (#2542)** |
| Exact template R2 upload/registration authority | Owner + independent thusico | **Pending** |
| Actual quotation service Worker/bindings and authenticated private access | Engineering + independent thusico + owner | **Pending** |
| Real protected staging save/reopen/PDF/denial and tested recovery | Engineering + independent reviewer | **Not run** |
| Exact-main production release and live postflight | Owner + independent thusico | **Not authorized** |

## Prohibited shortcuts

- Do not use alternate Cloudflare write endpoints merely to evade the previously denied Create Worker Version request.
- Do not treat prior caller/harness operational approval as approval for the service Worker, templates, private execution or production.
- Do not remove authentication, tenancy, CSRF, version/recovery safeguards, statutory terms review or independent approval.
- Do not modify production payment settings, production D1, or customer data.
- Do not represent a green offline test or this document as live staging completion.

## Reviewer decision

@thusico — please confirm whether the above direct private-staging plan is an acceptable **replacement test path**, specify the required private invocation mechanism and additional evidence, and clearly separate the source/plan approval from operational upload/execution approvals.

References: #2504 and #2542.
