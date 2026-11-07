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
