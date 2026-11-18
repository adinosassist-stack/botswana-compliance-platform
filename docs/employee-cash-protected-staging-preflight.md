# Employee Cash — protected staging preflight (read-only)

Related: issue #2653, merged hardening PRs #2656 and #2662. This workflow adds **evidence collection only**; it does not authorize or perform any D1 migration, Cloudflare Worker deployment, staff invitation, employee access or production release.

## Existing resources

- Cloudflare account: `ddd23cab31928a4bb3d4998df9b26d1d`
- **Only staging D1 allowed**: `bw-employee-self-service-staging`, UUID `adfa3871-5ecf-4672-8d2f-be9b142d5fc1`
- **Explicitly excluded production D1**: `bw-compliance-os`, UUID `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce`
- Existing GitHub protected environment: `employee-self-service-staging-protected` — must separately prove `thusico` reviewer, prevent-self-review, admin bypass disabled and deployment branch policy allowing `main` only.
- Uncreated inert staging Worker: `bw-employee-self-service-staging`. Its absence is a prerequisite, not a deployment request.
- Application flag `THEBE_EMPLOYEE_CASH_ENABLED = "false"` must remain unchanged.

## What preflight proves

1. All offline synthetic cash tests pass, including cross-tenant cash and audit checks.
2. Exact current `main` commit, approved `PREFLIGHT_ONLY` input and protected environment policy; any missing credential or policy **fails closed**.
3. Existing isolated D1 UUID and identity marker match, all eight tenant/staff portal tables are empty and `PRAGMA foreign_key_check` returns zero violations.
4. Employee Cash schema objects are all absent. A partial/previous migration makes this preflight fail, requiring investigation instead of a blind retry.
5. Core `employees`, `tenants`, `users` columns support the planned cash migration.
6. D1 Time Travel bookmark endpoint is available **without printing or exporting the bookmark**.
7. The Worker named above is absent. There are no public routes or browser sessions.
8. The exact proposed migration source is fingerprinted with SHA-256; only its checksum is reported. It is not executed.

## How to run after the PR is independently approved and merged

Open **GitHub Actions → Employee Cash - protected isolated staging read-only preflight → Run workflow**, choosing branch `main`, using:
- `expected_main_sha`: the **current** full 40-character commit SHA of main (re-check immediately before dispatch)
- `authorization`: `PREFLIGHT_ONLY`

The offline job always runs for a PR. Only the manually dispatched protected job can use the environment secrets and check real Cloudflare metadata. It must obtain independent `thusico` environment approval, which is separate from a PR review. The exact-main gate prevents running old approvals on a changed source.

Reuse the existing environment-scoped secrets `STAFF_STAGING_GITHUB_READ_TOKEN` (read only GitHub environment policy) and `STAFF_STAGING_CLOUDFLARE_TOKEN` (minimum D1 and Worker metadata/read-only query access). Never paste token values into chat, logs or GitHub comments.

**No preflight result authorizes a migration.** An actual additive D1 change requires separately recorded owner+independent reviewer staging migration approval bound to current main SHA, migration SHA-256, isolated database UUID, recovery bookmark acceptance, constrained migration workflow and rollback acceptance. A subsequent *authenticated* staging runtime is a different protected project; the current status-only Worker cannot be used as proof of employee login or manager approval.

## Troubleshooting without unsafe retries

- **Unavailable GitHub environment policy or missing token**: leave the job blocked; configure the protected environment independently.
- **Inert Worker is present**: stop and investigate previous bootstrap; do not delete or recreate it.
- **Cash tables already exist or provider outcome is unknown**: treat as potentially partially migrated; run read-only schema inspection and obtain separate remediation approval.
- **No recovery bookmark or schema mismatch**: stop; no migration should be attempted.
- **Main advanced after dispatch**: run a fresh preflight on the new exact SHA, never reuse old approval.

Audit summary must include SHA, protected GitHub run URL, reviewer evidence, stable migration SHA-256, staging resource identity checks, and pass/fail per guard. Do not record bookmark contents, credentials or customer data.
