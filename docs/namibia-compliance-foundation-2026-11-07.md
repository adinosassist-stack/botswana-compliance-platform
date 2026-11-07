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

## Batch 6 — Internal API candidate (2026-11-07)

Added `cloudflare/src/namibia-internal-api-candidate.js` and `tests/namibia-internal-api-candidate.test.mjs` on the existing draft PR.

The adapter is deliberately **not imported by `worker.js`**, not deployed and not exposed as a route. Before any future isolated-stage wiring, security review must confirm:
- Existing, server-validated session `authenticate(request,env)` resolves the actor and tenant from session and active membership records. No client-supplied tenant/role/market claim is trusted.
- An isolated `NA_CANDIDATE_DB` binding, separate from `env.DB`, is required.
- Both `NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED=1` and `NAMIBIA_INTERNAL_API_MODE=isolated_candidate` must be explicitly set; no production enablement is defined.
- `NA_CANDIDATE_TENANT_ALLOWLIST` contains only synthetic, test accounts; a real Namibia entitlement source is **not yet implemented**.
- Owner/manager RBAC, configured same-origin checks, CSRF protection for writes, bounded JSON reads and closed API operation paths.
- Evidence storage is **metadata-only**; no document contents or beneficial-owner personal data.
- Security tests assert disabled-by-default mode, server-session requirement, no public route, wrong-origin rejection and authenticated principal restrictions.
- This module has **no legal authority, filing capability or customer access**.

**Important limit:** An allowlist is not a production market entitlement. Authentication against the existing Botswana sessions database is a design dependency, not proof of Namibia-eligible tenant status. CI tests using synthetic sessions are not equivalent to deployed Cloudflare Worker end-to-end authorization tests. Never mount the API until independent security review verifies separate session/account data and cross-country access controls.

### Outstanding before approval

Run updated CI, assess least-privilege data binding isolation, complete adversarial tests with valid authenticated cookies and malicious tenant swaps, confirm retention/privacy obligations, conduct independent Namibia legal/tax approval, and obtain independent `thusico` sign-off. Do not merge, deploy, or enable customer-facing Namibia features without a later explicit owner approval.

## Batch 7 — authenticated internal API regression harness

Added `tests/namibia-authenticated-internal-api.test.mjs` and wired it into the Namibia candidate PR workflow.

The suite uses synthetic HMAC session cookies against the **actual** existing `authenticate` helper, a simulated server-side session/membership response, and a disposable local SQLite database loaded from the candidate schema. It covers positive owner writes, evidence/audit reads, manager membership, inactive sessions, excluded roles, tenant allowlist mismatch, forged cookies, CSRF mismatch, cross-origin requests, client-supplied identity overrides, an attempted forged tenant header, and the same entity reference under two different tenants.

**Boundaries:** The session/membership database is simulated; there is still no deployed HTTP worker route, no externally accessible API, no live tenant enrollment, and no proof that a staging Worker session store is distinct from the Botswana production session database. Do not introduce live tenant identifiers or personal information to tests. A true connected-Worker review requires explicit environment mapping, review of session tenant entitlements, independent security reviewer sign-off and a separate owner approval.

The isolated Cloudflare D1 database created for the previous batch contains synthetic data only. It has not been connected to this API. Production routing, migrations, payments and customer-facing Namibia compliance remain disabled.

## Batch 8 — regulator-source provenance candidate

Added `cloudflare/src/namibia-source-review-candidate.js` and `tests/namibia-source-review-candidate.test.mjs`.

- This candidate only validates research source metadata: unique Namibia source key, regulator, exact regulator domain, HTTPS URL, capture date and required SHA-256 of captured source content.
- BIPA, NamRA and FIC authority domains are allowlisted. Lookalike-domain, non-HTTPS, embedded credentials, query string, fragment, cross-authority mapping, invalid dates and absent hash are rejected.
- All records remain **unreviewed** with legal effective dates unset, and automatic deadline, filing, and customer release flags false. No rules are approved or automatically published by a valid source snapshot.
- The source hashes in tests are synthetic; no official website content has been captured, stored, or independently validated in this batch.
- This module is not imported into the live Worker, no new DB tables/migrations are applied, and no source content is automatically fetched.

Before the Namibia compliance pack can progress: retain authoritative source snapshots with retrieval timestamps, independently verify relevant legislation and effective dates against official primary texts, classify entity applicability, record Namibian legal and tax reviewer decisions, test rule versioning and appeals, and complete the separate security/release approval. The current code is a gated research foundation only.

## Batch 9 — versioned rule research review (2026-11-07)

Added `cloudflare/src/namibia-rule-review-ledger.js` and `tests/namibia-rule-review-ledger.test.mjs`; both included in Namibia CI.

- Every candidate revision binds a rule key, revision number, task domain, research question, official source identifier and SHA-256 fingerprint.
- Task domains are fixed to their expected BIPA, NamRA or FIC source authority. Spoofed sources and cross-authority mappings are refused.
- Proposed effective-from/to dates are valid-calendar-date checked and chronological, but **remain unverified legal effective dates**. No due date is inferred or published.
- The review ledger rejects duplicate rule-key/revision pairs and refuses records that claim approval, regulatory-pack registration, automated notifications or filings.
- Reviewer findings can record research concerns only (`needs_source_verification`, `requires_legal_opinion`, `needs_revision`, or `out_of_scope`); there is intentionally **no self-approval path**.
- No regulatory pack is registered, no database schema/migration or Worker route changed, no production writes, and no tenant-facing Namibia feature enabled.

Remaining tasks: immutable tenant/access-isolated persistence for source snapshot versions; SHA-256 verification of actual official document bytes; signed reviewer provenance; independent legal and security signoff; regulatory applicability mapping, notice and rule effective-date review; privacy/retention design; production migration and release approval. Automated CI results for this newest commit must be checked before calling this batch verified.

## Batch 10 — source-byte integrity and append-only provenance (2026-11-07)

Source-byte verifier `cloudflare/src/namibia-source-evidence-candidate.js` accepts caller-provided Uint8Array only, enforces a 2 MB ceiling, computes SHA-256 using Web Crypto, and rejects metadata/content mismatches. The module retains **only source hash, byte count, metadata and review-disabled state**; it does not fetch, upload or persist original source documents.

Proposal `proposals/namibia/002_source_evidence_candidate.sql` introduces source-version and research-review-note candidate tables with append-only triggers, composite foreign keys, source-revision uniqueness, source integrity checks and database-level approval flags locked off. It is deliberately **not in the migration directory** and was not applied to any Cloudflare D1 database in this batch.

Candidate tests in `tests/namibia-source-evidence-candidate.test.mjs` simulate digest mismatch, duplicate versions, unauthorized release flags, missing referenced source, immutability and linked rule/evidence integrity. Synthetic source text in the tests is not an actual BIPA/NamRA/FIC document.

Before any live persistence: privacy/retention design including lawful controlled erasure, verified document capture with authoritative retrieval timestamps, independent expert/legal signoff, authentic review-user attestations, and an explicitly isolated non-production D1 integration. These guardrails do not create regulatory approval, published rules or automated deadlines. Namibia stays inactive, PR remains draft, and no Botswana production writes were performed.

## Batch 11 — verified CI repair, isolated source D1, privacy/retention candidate

At commit `f3b270aa43340935974a7330926cfa57b339b53f`, the Namibia candidate check failed **1 of 34** tests. The exact failed assertion dereferenced `.value.activationReady` while `checkNamibiaSourceEvidenceLedger` returns `.activationReady` at the top level. Fixed the test in commit `428fab659bd055c0a4a64f9f3e1b601cbdebac98`. Fresh CI verification for the final batch commit is required.

**Actual isolated Cloudflare D1 rehearsal:** The existing disposable database `na-compliance-disposable-20261107` (ID `c8ce1dd7-6973-45e8-be7f-1b4f2b672312`) previously used solely for synthetic Namibia test records was verified to have the four candidate compliance tables. Proposal `proposals/namibia/002_source_evidence_candidate.sql` was successfully applied to **that disposable database only**. A synthetic source-version insert succeeded. Direct D1 queries then rejected attempted source approval/update, source deletion, insertion of an orphan review note, and creation of an approved review note. Follow-up counts: one synthetic source version; zero review notes. There are no external document captures or personal records. This D1 is **not** a production migration or Worker binding.

**Privacy and retention candidate:** Added `cloudflare/src/namibia-privacy-retention-candidate.js` and `tests/namibia-privacy-retention-candidate.test.mjs`. The module classifies regulatory metadata, evidence metadata, beneficial-owner identities, tax documents, reviewer notes and audit events, and produces review-only access/erasure/retention/export requests. It forbids raw-document storage, automatic deletion, automatic exports or cross-border transfers. Retention periods stay unset until counsel and privacy review. The candidate does not issue legal advice or implement actual deletion or data subject request processing.

**Remaining gates:** approved privacy/retention schedule and controlled audit lifecycle; source capture of real official documents with authentic provenance; independent Namibian legal/tax review; connected end-to-end authenticated Worker testing against distinct staging sessions and D1; independent `thusico` security review; owner deployment approval. No customer-facing Namibia features, production DB writes, PR merges, or live regulatory rules are authorized.

## Batch 12 — authenticated-reviewer research note candidate

- Previous head `a675c096a5fceb14f9d108b5d11f407c3a4cdc0f` passed the Namibia candidate CI and reported regression checks.
- Tightened `proposals/namibia/002_source_evidence_candidate.sql`: each research note now has a source SHA-256 value, and a composite foreign key `(source_id,source_revision,source_sha256)` references the immutable source version's corresponding triple. A changed hash or missing revision cannot be accepted by the database.
- Added `cloudflare/src/namibia-research-note-intake.js`, an **unmounted** review-note writer. It requires a server-provided reviewer principal, rejects user-submitted reviewer identities/approval flags, requires an explicit source revision, and only inserts the narrow `needs_source_verification`, `requires_legal_opinion`, `needs_revision`, or `out_of_scope` notes.
- Added `tests/namibia-research-note-intake.test.mjs` and updated the existing SQLite provenance tests and Namibia CI. Tests cover valid research-note creation, authority spoofing attempts, wrong source SHA, nonexistent revisions and blocked unauthorized roles.
- Security limit: `authenticatedBy: "server_session"` is only an **internal integration contract**, not standalone authentication proof. The writing function must never be exposed through HTTP without cryptographic/session verification and independent RBAC assessment. The current unmounted Worker has no path to it. It never approves, publishes, or activates any regulatory rule.
- The amended proposal is intentionally **not re-applied to the existing disposable D1** because that database has an older schema; real migration/rollback on a newly isolated blank D1 must be separately qualified. No production migration, release, or Namibia activation occurred.

Still required: source documents actually fetched and SHA-256 checked against regulator-approved evidence, retention and legal-hold counsel review, real staging principal binding and auth, legal/tax reviewer acceptance, independent `thusico` review, CI, and separately authorized release.

## Batch 13 — reviewer-note regression fix and fresh D1 v2 rehearsal

The CI for head `fb5a0a6af7255555f855661cc10c82871ac7ff4d` reported a **failed Namibia candidate check**. The job log identified a test assertion comparing a null-prototype SQLite row directly with an object literal; the values themselves matched. The current branch test normalizes the result with `rows.map(row=>({...row}))`. This does not change functional security behavior. Do not claim the newest head passed CI until its run is checked.

Created a fresh **disposable Cloudflare D1** named `na-source-review-disposable-v2-20261107`, ID `b45ebf26-429d-47ae-ae88-c404c8965c5b`, with no Worker binding or customer route. The latest `proposals/namibia/002_source_evidence_candidate.sql` applied successfully (9 D1 query results).

Synthetic D1 probes:
- Insert source revision and matching `source_sha256` research note: **passed**.
- Insert note with mismatched SHA-256: **rejected**.
- Insert note for nonexistent source revision: **rejected**.
- Change reviewer note to approved: **rejected**.
- Delete append-only review note: **rejected**.
- Post-probe counts: exactly **1 synthetic source revision** and **1 synthetic reviewer note**.

This is direct-query database constraint testing, **not authenticated API or legal review validation**. It does not prove a reviewer is authenticated, independently authorized, or legally qualified. No official document or personal data was ingested. No existing Botswana D1 or earlier Namibia D1 was altered. The fresh isolated D1 is not a production/staging runtime database and requires a deliberate retention/cleanup decision.

Remaining gates: connected staging authentication and reviewer authorization, source review against real BIPA/NamRA/FIC primary documents, legal effective-date verification, privacy retention acceptance, independent `thusico` approval, and separately authorized deployment. All market activation and filing automation remain disabled.

## Batch 14 — isolated staging guard at the candidate API boundary

The previous head `532be1e6403368d0cb53e5e7e24c0caebe937c33` passed Namibia CI, audit-remediation CI and independent review regression workflows. The separate recovery workflow was still running at initial check.

Added `cloudflare/src/namibia-isolation-preflight.js` and `tests/namibia-isolation-preflight.test.mjs`; integrated preflight into the **unmounted** `namibia-internal-api-candidate.js`. Its rehearsal mode now rejects:
- Shared `DB` and `NA_CANDIDATE_DB` binding objects.
- Missing or duplicate staging-session, candidate-data and Botswana-production database identifier declarations.
- A non-disposable stage kind or missing deployment-provided binding-audit flag.
- Missing, duplicate, or non-synthetic tenant allowlist entries.
- All customer or production activation modes; existing market readiness remains fail-closed.

Existing simulated HMAC-authenticated API tests now include explicit **synthetic** staging declarations. The added guard is not proof of real Cloudflare binding identities: environment markers can be misconfigured and must be checked independently by reviewing Cloudflare metadata, account permissions, environment source SHA, and a physically separate staging authentication database. No Cloudflare Worker was deployed or bound in this batch.

Before a genuine internal pilot: separately audit physical binding UUIDs and session-store segregation, require independent `thusico` security review, reconcile real legal source evidence, confirm privacy/retention and controlled erasure, and obtain a separate owner approval for any deployment. All Namibia customer functions remain disabled.

## Batch 15 — actual Cloudflare D1 identity check (read-only)

The Namibia candidate workflow passed for prior head `7891e209fd7e88c2faf0a103a828701aecd3d691`; several broader repository CI jobs remained in progress at the time of the check.

An authenticated **read-only** Cloudflare D1 inventory listed:
- Botswana production `bw-compliance-os`: `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce`.
- Namibia compliance disposable `na-compliance-disposable-20261107`: `c8ce1dd7-6973-45e8-be7f-1b4f2b672312`.
- Namibia source review disposable `na-source-review-disposable-v2-20261107`: `b45ebf26-429d-47ae-ae88-c404c8965c5b`.

These three physical D1 UUIDs are distinct. **No dedicated Namibia session D1** was found in the checked inventory. This is a **blocking requirement** for a physically isolated authenticated Namibia pilot; using the Botswana production session DB as a substitute is not approved.

Added `cloudflare/src/namibia-d1-inventory-audit.js` and `tests/namibia-d1-inventory-audit.test.mjs`. The read-only inventory verifier detects mismatched expected identities, duplicate/colliding UUIDs and missing isolated session DB, and never declares a pilot launch-ready. The observed inventory values in regression tests are a fixed snapshot, not a live binding attestation. Actual Cloudflare Worker script/environment bindings and independently authenticated session membership must still be verified separately before any pilot.

No Worker binding or deployment changed; neither disposable D1 was mutated in this batch. No regulatory rules, payments, customer sessions or production data were enabled or written. Independent `thusico` review, Namibian legal/tax signoff and owner release approval remain outstanding.

## Batch 16 — isolated disposable session D1 (2026-11-07)

Prior head `ff613babb43649be1cb8d9f58f9db3d55c0beda7` passed Namibia candidate checks, audit remediation and independent-review regression checks.

Created Cloudflare D1 `na-sessions-disposable-20261107` (UUID `cb833f28-8ea6-4234-b183-c12c018aac15`). This UUID is distinct from the two Namibia research D1 instances and production Botswana D1 `bw-compliance-os`. It has **no Worker binding, no deployed login route and no actual customer accounts**.

Created candidate SQL in `proposals/namibia/003_disposable_sessions_candidate.sql`, intentionally not in the production migrations directory. The schema was applied only to the new D1. It implements minimal `users`, `memberships` and `sessions` tables compatible with the existing session authentication SQL and imposes synthetic-ID and `@example.test` email constraints. No live authentication services have been activated.

Added `tests/namibia-disposable-sessions.test.mjs` for in-memory SQLite verification of synthetic identity constraints, active/suspended membership access, session generation invalidation and token-hash matching. Updated the inventory regression test with the new physical D1 UUID and added both candidate SQL and tests to CI. All tests are synthetic; the staging isolation preflight still demands a separately verified binding audit.

An attempted live synthetic-session insertion verification was blocked by a safety check, so no live session record was inserted by that probe and its behavior **must not be represented as verified**. Physical D1 schema creation succeeded; functional session behavior is covered by local regression tests pending CI.

Open gates: fresh CI, genuine physical Worker-binding review, isolated authentication service qualification, official Namibian legal source evidence and effective-date review, privacy/retention policy, independent reviewer `thusico`, and separately authorized deployment. Do not merge, connect a Worker, migrate production, or activate customer-facing Namibia compliance.

## Batch 17 — end-to-end local dual-DB authentication integration

The previous head `36045c565df7f2edca55a0fb0bf6fb8e3dbafd4f` had **successful** Namibia candidate, audit remediation, independent-review regression, client runtime identity and recovery CI runs.

Added `tests/namibia-full-isolated-auth-rehearsal.test.mjs` to Namibia candidate CI. Unlike earlier mocked-membership tests, it instantiates two **physically separate in-memory SQLite handles** from the actual `003_disposable_sessions_candidate.sql` and `001_compliance_candidate.sql` proposals, then runs `handleNamibiaInternalCandidate` with a WebCrypto HMAC session cookie and the existing server-side `authenticate` helper. It covers:
- synthetic session/user/membership fixture creation and authorized owner entity/evidence writes;
- authenticated tenant-scoped evidence reads and audit trail integrity;
- forged cookie rejection, CSRF failure, and suspended membership denial;
- invalidation after session generation rotation;
- denial of real user identity/email fixtures and deliberate production ID collision.

This is a **local Node/SQLite end-to-end contract test**, not a deployed Cloudflare Worker. It does not create actual web sessions, test Cloudflare Worker binding metadata, or prove regulatory correctness. The Cloudflare disposable Namibia session D1 remains **unbound and not populated by this batch**. The candidate API and any HTTP endpoints remain disconnected from `worker.js`, all actual Namibia customer activation disabled, and no production migration or deployment took place. Latest CI results still require verification.

## Batch 18 — strict payload and Origin protections

Prior head `30d993b1445ce60f80a198af842f8cf4bd039a06`: Namibia candidate CI and independent-review regression jobs passed; broader recovery/audit jobs were still running at the initial check.

Tightened the **unmounted** Namibia candidate store to use explicit field allowlists for entity drafts, evidence metadata and calendar drafts. Unexpected fields are refused even if their value is null, false or an empty string, preventing silently ignored hidden personal-data objects or upload metadata. Existing positive schemas and tenant-keyed D1 transactions remain unchanged. Calendar action attempts explicitly return `activation_not_authorized`.

Tightened the internal API candidate: authenticated POST requests require an exact explicit `Origin` matching `PUBLIC_ORIGIN`, in addition to the existing CSRF check and cookie authentication. Read requests maintain existing origin semantics. Extended API and store regressions for absent Origin and extra input keys.

These are code-only protections in a review branch. They do not verify an actual deployed edge policy, real Worker binding, production authorization, or a Namibian regulatory deadline. Latest CI must be checked before a green qualification assertion. Namibia stays off, PR is unmerged and Botswana production is unchanged.

## Batch 19 — read-only Worker settings binding audit

Prior commit `f32a808731fd2fc5a983f2b27e877d4e0a2f61bd`: Namibia candidate CI, audit-remediation and independent review regressions succeeded. A separate recovery CI run was cancelled, not passed.

Authenticated read-only Cloudflare API checks discovered five Worker scripts and retrieved each script's binding settings (no secret values). Observed binding D1 identifiers:
- `bw-compliance-os`: `DB` → `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce` (Botswana production).
- `bw-billing-staging`: `DB` → `9d1b8852-4424-46e9-ba24-cdad5ced215f`.
- `bw-compliance-os-ops-rehearsal`: `DB` → `c5c232a8-8fe7-440c-81ba-021a44fd3fdd`.
- `bw-corporate-assets-staging`: `DB` → `e19f09de-3bb9-4021-b4f8-44df04c8aaa8`.
- `bw-general-ai-staging`: `DB` → `ff229eef-7724-49ae-9d68-d3a1db669b63`.

**Finding:** None of these five script settings contains a D1 binding to the disposable Namibia compliance, source-review, or session database IDs. No dedicated Namibia Worker was present in that account's listed scripts. The production Worker uses its expected Botswana database ID.

Added `cloudflare/src/namibia-worker-binding-audit.js` and `tests/namibia-worker-binding-audit.test.mjs` with regression coverage of observed settings, accidental Namibia bindings, missing production DB binding, bad/duplicate inventory and ID collisions. The tests use fixed observed identifiers and cannot substitute for a fresh authenticated Cloudflare inventory.

The audit establishes current settings only; it is **not** proof of absent environment-scoped variations, future deployment behavior, domain routes, or security sign-off. It does not enable a staging pilot. No Worker, D1, route, environment or secret was modified. Namibia remains disabled, pending real staging auth, independent review and approved release.
