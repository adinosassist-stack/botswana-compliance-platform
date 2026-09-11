# v77 — CIPA / OBRS Registry Reconciliation Runbook

Date: 1 September 2026

## Release boundary

v77 operates in **manual evidence** mode. It does not call CIPA, log in to OBRS, scrape authenticated pages, submit a filing or claim live registry synchronization.

CIPA/OBRS remains the source of truth for official registration particulars. Thebe Desk stages a normalized snapshot, identifies drift against the internal company profile and requires an owner decision before changing any profile field.

Official starting points:

- CIPA: https://www.cipa.co.bw/
- CIPA register search: https://www.cipa.co.bw/master/ui/start/CIPARegisterSearch
- CIPA information centre and user guides: https://www.cipa.co.bw/information-center

No public, implementation-ready machine endpoint, authentication, scope and response-schema contract was located during the v77 release review. Obtain the production contract directly from CIPA before building or enabling a live adapter.

## Controlled operating procedure

1. Open CIPA/OBRS from the Corporate workspace and obtain a current company extract or register-search record.
2. Upload the record to the Evidence Vault with category **Corporate**.
3. Wait for malware scanning, then complete the existing human evidence approval.
4. In Corporate → CIPA / OBRS reconciliation, choose the approved evidence record.
5. Enter the source observation date and normalized registry particulars.
6. Confirm that the values were reviewed against the attached current source and stage the snapshot.
7. Review every field difference. A manager may stage evidence; only an owner may resolve a difference.
8. For each difference, either:
   - **Apply CIPA value** — changes that one workspace profile field only; or
   - **Keep workspace value** — requires a factual reason of at least ten characters.
9. Re-stage from fresh evidence if the source is older than 31 days, the evidence is no longer approved/clean, or the internal profile changed after staging.

## Normalized fields

| Registry field | Workspace field | Resolution rule |
| --- | --- | --- |
| CIPA UIN / registration number | `profile.cipaUin` | Owner approval |
| Registered legal name | `profile.name` | Owner approval + material-profile event |
| Entity type | `profile.entityType` | Owner approval + regulatory recheck |
| Registry status | `profile.cipaStatus` | Owner approval |
| Registration date | `profile.incorporationDate` | Owner approval |
| Annual-return month | `profile.cipaMonth` | Owner approval |
| Registered office | `profile.registeredOffice` | Owner approval |

Internal operational fields—employees, locations, tax flags, evidence, workflows and daily reports—are never sourced from this registry workflow.

## Safety controls

- tenant and company isolation on every query;
- `cipa_survival` entitlement enforced server-side;
- Corporate evidence only;
- upload complete, SHA-256 present, scan-clean and human-approved evidence required;
- source observation no more than 31 days old;
- content hash covers source fields, evidence hash, workspace version and comparison baseline;
- duplicate snapshot suppression;
- older active snapshots and pending comparisons are superseded;
- owner-only resolution;
- workspace-version and internal-value hash checks before application;
- conditional D1 updates prevent a concurrent “keep” decision or profile edit from being overwritten;
- authoritative audit events for staging, applying and retaining values;
- normalized fields only in D1; raw evidence remains in private R2.

## API surface

- `GET /api/cipa/registry?companyId=...` — mode, source-of-truth policy, latest snapshot, comparisons and eligible evidence.
- `POST /api/cipa/registry-snapshots` — stage a confirmed evidence-backed snapshot.
- `POST /api/cipa/reconciliations/:id/resolve` — owner applies the registry value or retains the workspace value.

All routes use the existing authenticated session, same-origin and CSRF controls.

## Future live-adapter acceptance gate

Do not change `liveSync` to true until all of the following are complete:

- written CIPA authorization and production credentials;
- official HTTPS base URL, authentication flow, scopes and versioned schemas;
- read-only least-privilege scope for the first release;
- test-company identifiers and permitted use/data-retention terms;
- bounded timeout, retry, backoff and `429` handling;
- paging/cursor and partial-run recovery;
- source response hashing and private raw-response retention policy;
- provider request/response correlation without logging credentials or unnecessary personal data;
- duplicate and out-of-order response tests;
- field mapping approved against real responses;
- source-of-truth and conflict rules reviewed with a Botswana company-secretarial professional;
- sandbox plus live read/reconciliation evidence;
- failure, credential-rotation and access-revocation drills;
- UI copy changed only after the deployed connector proves a current successful sync.

Browser passwords, screen scraping and guessed endpoint paths are prohibited.

## Verification commands

```bash
npm run test:cipa-v77
npm test
```

Apply `cloudflare/migrations/019_v77_cipa_registry_reconciliation.sql` after the v76 migration. The migration is additive; preserve both CIPA tables during rollback so staged evidence and owner decisions remain auditable.
