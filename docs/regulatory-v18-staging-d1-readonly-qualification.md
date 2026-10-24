# Regulatory v1.8 — actual Cloudflare D1 staging preflight qualification

**Scope:** operator-invoked read-only evidence, not an import, approval, or deployment. Relates to #1788 and #1793.

## Before invocation

Provision **separate** Cloudflare D1 staging data, isolated from production; seed only designated v1.7 test records with reviewed provenance. Do not clone real tenant records into this database. Ensure all schema migrations are applied by the normal separately approved staging process. Check that the service identity and the named staging D1 instance match.

Use a restricted Cloudflare API token whose scope permits only the necessary account/D1 access. The script cannot issue D1 SQL mutations but the token's permissions should be additionally limited at the provider.

Set all five environment variables in your **local operator session** or an approved staging-only runner (never commit values):

- `CLOUDFLARE_API_TOKEN`: token; do not print it
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID (32 hex characters)
- `REGULATORY_STAGING_D1_ID`: **staging** database UUID
- `PRODUCTION_D1_DATABASE_ID`: production database UUID used **only as an exclusion comparator**
- `REGULATORY_STAGING_D1_NAME`: exact, expected staging DB name, with a `staging`, `evaluation`, `sandbox` or `test` segment (for example `bw-compliance-os-regulatory-staging`)

Then run:

```bash
npm run audit:regulatory-staging-readonly > regulatory-staging-attestation.json
```

No Cloudflare credentials or live database identifiers are written to the report. The staging ID is represented by a short nonreversible SHA-256 fingerprint for evidence correlation. The CLI never transmits a user-authored SQL command. It executes **four hardcoded, read-only SQL queries** via Cloudflare D1's `/query` API, after verifying the remote database's UUID and exact name. The D1 HTTP endpoint uses POST for SQL SELECT transport; this is *not* a database write.

The returned attestation includes governed source preflight counts and changed-field metadata, approved/published legacy 25-day VAT rule blockers, and aggregated, de-identified prior obligation counts. It marks `decision: human_review_required` even with no blockers.

Exit status:

- `0`: read-only inspection completed; **not** permission to import
- `2`: protected source drift or active legacy VAT rule; remain blocked
- `1`: identity, credentials, query, PII, truncation, schema or provider failure; no positive attestation

The four query inputs and API paths are pinned in `scripts/regulatory-staging-readonly-attestor.mjs`. The legacy obligation aggregate is `cloudflare/queries/regulatory-legacy-vat-obligations-readonly.sql`. Tests prove production-ID fencing, exact name matching, no arbitrary SQL, limited output fields, error redaction and no writes. The stage audit can fail if the database is unprovisioned or out of date; do not weaken validation to make it pass.

## Human acceptance checklist

1. Independent code approval and a green protected release regression suite for the read-only attestor PR.
2. Confirm staging D1 is isolated and seeded with the intended v1.7 source, rule and obligation fixtures.
3. Run read-only remote audit; retain JSON report in an access-controlled release artifact store. Cross-check the reported database fingerprint with the designated staging DB.
4. For any protected source drift, reviewer inspects official full-text source snapshots, history and maker/checker approvals; for any active 25-day VAT rule, apply a separate governed legal disposition. Do not auto-retire.
5. Use the already-reviewed populated v1.7→v1.8 **full-schema local test**, then only with separate staging authorisation execute an actual v1.8 import on **test data** and repeat read-only inspection. Compare expected draft statuses and idempotency; do not simulate reviewer approval.
6. Independently inspect live production preflight if separately authorised, without write permissions. Review the aggregate history under #1793. Human acceptance and distinct explicit production go/no-go are necessary.

**This script does not perform the staging import.** No actual Cloudflare D1 query was made while authoring this code, and a green local CI result is not an operational D1 staging qualification.

## GitHub Actions (operator-approved staging-only dispatch)

After this workflow PR has independently passed CI and merged to `main`, use the GitHub Actions workflow `Regulatory Staging D1 Read-only Attestation`. It **does not run on push, PR or a schedule** and cannot perform a migration.

**One-time GitHub setup** (by a repository administrator): create the `regulatory-staging` environment with required reviewers, restrict it to `main`, and populate this **environment** with the following values. Do not substitute production credentials or expose them in commit history.

| Environment field | Type | Meaning |
| --- | --- | --- |
| `REGULATORY_STAGING_CLOUDFLARE_TOKEN` | Secret | Dedicated least-privileged staging account token |
| `REGULATORY_STAGING_CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare account holding the segregated staging D1 |
| `REGULATORY_STAGING_D1_ID` | Variable | Staging D1 UUID |
| `REGULATORY_STAGING_D1_NAME` | Variable | Exact staging DB name with a staging/evaluation/sandbox/test segment |
| `PRODUCTION_D1_DATABASE_ID` | Variable | Production UUID **for exclusion only**, never queried |
| `REGULATORY_STAGING_AUDIT_ENABLED` | Variable | Explicitly set `READ_ONLY_APPROVED` after environment reviewers and target fencing are configured |

Run it from [the repository's Actions page](https://github.com/adinosassist-stack/botswana-compliance-platform/actions) by choosing `Regulatory Staging D1 Read-only Attestation` → `Run workflow`, branch `main`, the **exact current `main` 40-character SHA** in `expected_sha`, and confirmation `READ_ONLY_STAGING_D1`. A missing setting, a stale commit SHA, or an identical production/staging UUID fails before any Cloudflare SQL request. The runtime independently checks Cloudflare's remote database UUID and exact name before making any data queries.

A successful GitHub job reports only aggregate counts in the step summary and uploads a **three-day retention** redacted JSON audit artifact. Protected drift and legacy VAT blockers can make the check exit 2; this is a meaningful *blocked* outcome, not permission to bypass a governance gate. This evidence still needs human review and cannot complete the actual D1 staging import or production regulatory approval.

If the protected `regulatory-staging` environment does not exist or has no required reviewers, **do not dispatch**; configure environment protection before enabling `REGULATORY_STAGING_AUDIT_ENABLED`. The workflow checks the enabling variable but cannot independently prove the GitHub environment's required-reviewer settings.

> Security boundary: Actions upload artifacts are accessible to authorised repository users. Do not use live customer records in staging. Keep the staging token scoped as narrowly as the Cloudflare account setup permits, and review the emitted report before retaining or sharing it.
