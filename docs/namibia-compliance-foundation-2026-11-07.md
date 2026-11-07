# Namibia compliance foundation — research candidate

Status: **development only / fail closed**. Botswana remains the sole live jurisdiction.
Owner: Thebe Desk. Target market: Namibia (NA), NAD, Africa/Windhoek.
Code entry: `cloudflare/src/namibia-compliance-candidate.js`. This is deliberately **not** registered in `regulatory-pack-registry.js` or turned on in `market-profile.js`.

## Evidence-based starting domains

| Domain | Authority and current primary source | Workflow to build | Review boundary |
| --- | --- | --- | --- |
| Company annual returns and duties | [BIPA](https://www.bipa.na/annual-duty/) | Entity-type profiles, financial year-end, receipts, draft reminders | Confirm entity form, fee, calendar and effective dates before advice |
| Beneficial ownership | [BIPA](https://www.bipa.na/beneficial-ownership/) | BO register, change history, BO/BO2 filing evidence | Verify event-specific deadlines and no-change BO2 exceptions with BIPA |
| Tax and VAT | [NamRA ITAS](https://itas.namra.org.na/taxes) | Registration applicability questions, turnover basis, proof-of-filing | No VAT threshold, rate or deadline is hardcoded in this candidate |
| AML/CFT/CPF | [FIC](https://www.fic.na/) | Activity-based applicability, escalation and evidence | Do not classify all SMEs as accountable institutions |

Research reviewed 2026-11-07. Links are source leads, not a legal sign-off.
Regulatory source pages and legislation can change; verify at an effective date with local counsel/tax professionals. Do not auto-submit, auto-register, auto-assess penalties or label an entity compliant.

## Implementation sequence
1. Independent Namibian legal/tax review; record source snapshots, legislation, effective dates and applicability.
2. Map existing Botswana rule models to strictly country-keyed Namibia source/rule/evidence tables, with tenant-scope tests and rollback rehearsal.
3. Add N$ UI, date/time and entity type handling to *Namibia-only* preview, using existing market profile.
4. Add editable calendar drafts, supporting documents, audit trail and human-reviewed BIPA/NamRA workflows.
5. Validate alerts against authoritative examples and edge cases. Independently approve the sealed pack, billing scope, security and release gates before any production activation.

## Safety acceptance
- Keep `NA.runtimeEnabled=false`, `NA.rolloutStatus="next"`, and `NA.regulatoryPack=null` until a separate approved release.
- No production D1 writes, migration, API exposure, payment activation, public Namibia launch claim, or legal determination.
- Preserve Botswana seed import compatibility and market activation fail-closed tests.
- Independent review requested from `thusico`; never self-approve or bypass required checks.

## Batch 2: draft workflow engine and internal preview

Implemented in `cloudflare/src/namibia-compliance-workflows.js`, with tests in `tests/namibia-compliance-workflows.test.mjs` and an internal, non-public prototype at `prototypes/namibia-compliance-preview.html`. This preview reads local browser inputs only and does not call production APIs, save data, send notifications, or submit filings.

- BIPA entity-type selection: companies and Section 21 companies → CM23; close corporations → CC7; confirm final classification and applicable fees with BIPA.
- Beneficial ownership: BO1 for changed details, BO2 candidate for unchanged details, or a review state when unknown. BO2 is not automatically approved, and change-specific deadlines are never inferred.
- NamRA VAT: ITAS currently publishes mandatory registration above N$500,000 of annual taxable turnover and voluntary registration where above N$200,000 (subject to eligibility). The engine uses these only to flag **review categories**; it does not register, file, or calculate liabilities. [Source](https://itas.namra.org.na/taxes).
- FIC: sector/activity review task without automatic classification.
- Evidence checklist: explicit accepted evidence categories with missing-item calculation; even a complete checklist does not authorize filing.
- Reminder preview: user-proposed dates only, explicitly unverified with notifications disabled.

### Validation requirements

Run `node --test tests/namibia-compliance-candidate.test.mjs tests/namibia-compliance-workflows.test.mjs`, `node tests/v169-regulatory-pack-registry.mjs`, and `node tests/v172-market-activation-gate.mjs` in the dedicated CI workflow. CI green is not regulatory approval. Verify every policy source, effective date, BIPA BO2 condition, NamRA taxable turnover definition, FIC applicability, and legal interpretation with authorized local reviewers before activation.

### Known next implementation gates

- Tenant-keyed persisted evidence storage / audit API using existing security model (not built here).
- Verified filing calendar and notices, immutable source snapshots, and professional review records.
- Security architecture and access-control review for any preview-to-runtime integration.
- Namibia-only billing and regional data-protection assessment.

## Batch 3: tenant-scoped persistence *candidate* and planning calendar

- Candidate SQL only: `proposals/namibia/001_compliance_candidate.sql`; intentionally excluded from `cloudflare/migrations` and production schema.
- Review-only metadata adapter: `cloudflare/src/namibia-compliance-candidate-store.js`; intentionally not imported by the Cloudflare Worker or routed through production APIs.
- Explicit tenant and user context is required from an authenticated principal for every read and mutation. No user-provided tenant override. Role restricted to NA owners and managers, with tenant-keyed queries and foreign keys.
- Metadata-only evidence records, calendar planning drafts, and audit records are proposed as transactional D1 batches. No document uploads, personal BO identities, filing submission, reminder delivery, or tax/legal determination.
- Internal prototype now shows manual planning dates beside each obligation; these are NOT statutory deadlines.
- Candidate tests: `tests/namibia-compliance-candidate-store.test.mjs`. Mocked DB tests check tenant filtering, absence of cross-tenant rows, audit coupling, input rejection, and that the migration is separate from production. They do not establish integration with a real D1 instance.

### Required independent review before persistence is enabled

1. Rehearse candidate SQL on a disposable, Namibia-only D1 database and test transactions, composite foreign keys, triggers/invariants and rollback under injected failures.
2. Confirm authenticated principal shape, explicit country/tenant entitlement, RBAC and safe access paths for any future Worker route. The current adapter is **not** an authorization boundary for user traffic by itself.
3. Design field-level data minimization, retention, access requests, lawful processing, encryption, and deletion/backup behavior under Namibia data-protection requirements before handling personal documents.
4. Add review-aware authoritative source snapshots and verified jurisdiction-specific effective dates; keep all reminder delivery disabled until legal review.
5. Add adversarial integration tests for tenant swaps, manager role boundaries, audit write failures, duplicate references, replay, and rollback.
6. Keep Namibia rollout disabled and preserve Botswana production behavior. No merge, migration, or deploy without independent review and explicit owner release approval.

## Batch 4: disposable transaction rehearsal and calendar overview

- Added `tests/namibia-compliance-sqlite-rehearsal.test.mjs` using Node 22 `node:sqlite` and a fresh in-memory database for each test.
- Tests apply only the **candidate proposal SQL**, with foreign keys on. They exercise tenant-scoped entity/evidence/calendar reads, audit events, schema constraints, cross-tenant reference rejection, and injected audit failures that must roll back the original write.
- This is a **SQLite/D1-compatible local simulation**, not a Cloudflare D1 staging integration, and the test harness simulates D1 `batch()` transactional behavior. Cloudflare D1-specific execution, isolation, retries and fault-injection must still be rehearsed independently on a disposable account/database before production migration approval.
- Added a small internal planning calendar overview to `prototypes/namibia-compliance-preview.html`. It does not use network calls, store records, persist dates, trigger notifications, or assert statutory deadlines.
- Dedicated CI checks include the new rehearsal test. CI outcome must be confirmed from GitHub Actions; code committed does not imply tests passed.

### Deferred, owner-controlled gates

No PR merge, production/staging migration, Cloudflare runtime binding, customer rollout, official due-date notification, or Namibia regulatory activation. Require passing CI, independent `thusico` review, Namibian regulatory experts' verification, storage privacy assessment, disposable actual D1 rehearsal, and a separately authorized release.

## Batch 5 — actual isolated Cloudflare D1 execution (2026-11-07)

An independent **disposable** D1 database named `na-compliance-disposable-20261107` (ID `c8ce1dd7-6973-45e8-be7f-1b4f2b672312`) was created in the existing Cloudflare account. This is not a production/staging binding, is not linked to a Worker, and contains only synthetic tenant IDs and entity references.

Verified against Cloudflare's D1 query API:
- Candidate SQL applied: all four NA tables and their indexes created successfully.
- Synthetic tenant A and tenant B entity inserts succeeded.
- A cross-tenant foreign-key evidence insert was rejected.
- Setting `filing_enabled=1` was rejected by a CHECK constraint.
- Duplicate tenant/entity primary key was rejected.
- In one multi-statement D1 query, a deliberately invalid audit insert caused the preceding evidence insert to roll back. Follow-up count query confirmed **zero** evidence and audit records from the failed batch.
- Added and applied append-only audit triggers to the disposable database. UPDATE and DELETE attempts on synthetic audit events were rejected.

**Scope limitations:** No executable Worker adapter or authenticated HTTP route was exercised. These tests demonstrate schema constraints and D1 batch rollback under the tested direct-query path, **not** identity authorization, tenancy security at an API boundary, application end-to-end behavior, or regulatory correctness. No customer data was accessed. Existing Botswana D1 databases were not modified.

**Retention note:** Audit immutability is a candidate safeguard only; legal retention, erasure, record minimization, and controlled deletion must be reviewed before real-person data is added. The disposable test database can be deleted after evidence retention approval; do not treat it as a deployable Namibia database.

**Still gated:** CI on latest commit, independent reviewer signoff, full tenant-authenticated route integration, privacy and legal review, deliberate migration strategy, owner approval, and production release. Namibia stays disabled.
