# Employee Self-Service — protected inert staging Worker bootstrap handoff

**Scope:** One-time deployment of an inert, route-free Cloudflare Worker only. This is **not** employee login activation, customer onboarding, a full production-shaped staging environment, or a production migration.

## Dependencies

1. First merge [employee feature PR #2253](https://github.com/adinosassist-stack/botswana-compliance-platform/pull/2253) under its main-branch rules: exact source, successful mandatory checks, an up-to-date branch, and independent `thusico` approval on the final commit.
2. Review and separately merge this stacked protected-bootstrap PR. Its initial base is `feature/employee-self-service-20261108`; retarget to `main` after the dependency has merged. Never deploy it from the feature branch.
3. Inspect Cloudflare D1 **only** `bw-employee-self-service-staging`, UUID `adfa3871-5ecf-4672-8d2f-be9b142d5fc1`, account `ddd23cab31928a4bb3d4998df9b26d1d`. Its marker `employee_self_service_staging_identity` and five employee portal tables were separately verified. The protected guard requires all eight data tables to remain empty with no FK errors.
4. Configure GitHub Actions environment **`employee-self-service-staging-protected`**, selected deployment branch **`main` only**, required reviewer **`thusico`**, **prevent self-review on**, **do not allow admin bypass**. The guard verifies policy via GitHub REST, not the existence of the named environment.
5. Configure two **environment secrets**, not repository-wide secrets:
   - `STAFF_STAGING_GITHUB_READ_TOKEN`: a GitHub credential able to **read this repository's environment settings and selected deployment branch policies**. Grant only the narrow repository administration-read scope required by these endpoints. Do not put the value in chat.
   - `STAFF_STAGING_CLOUDFLARE_TOKEN`: a **short-lived staging-only** credential scoped to bootstrap this Worker and read/query only the isolated D1. Determine minimum permissions by actual review, not a broad production deploy token. Never print or reuse it for production.
6. No `SESSION_SECRET`, staff account, production D1, public hostname, customer payments, POP upload, or external endpoint is needed for this inert status-only Worker.

## Execute, only when all prerequisites are met

Open the GitHub Actions workflow **Protected employee self-service inert staging bootstrap** on protected `main`. First select `preflight`. For the actual one-time operation, enter:
- `mode`: `bootstrap-inert`
- `expected_main_sha`: exact current 40-hex `main` commit SHA
- `authorization`: `BOOTSTRAP_INERT_EMPLOYEE_STAGING`

The job requires the protected environment gate and reruns the exact SHA check, route-free config checks, adversarial tests, Wrangler offline dry-run, GitHub environment-policy inspection, empty isolated D1 evidence, and proof that the named Worker does **not** already exist. It repeats the source and resource checks immediately before creating the Worker.

Successful deployment creates only `bw-employee-self-service-staging`, with `workers_dev=false`, `preview_urls=false`, no routes, no assets, no triggers, no other bindings except the isolated D1, `THEBE_STAFF_PORTAL_ENABLED=false`, `STAFF_STAGING_WRITES_ENABLED=false`, and an intentionally **UNQUALIFIED** source marker. Therefore the Worker will not serve employee login or any public endpoint, even if an unauthorized request could reach it. It is not a customer-facing release.

## Failure, safety and evidence

- If the environment is missing required independent review, a secret is missing, a token cannot read required metadata, `main` has advanced, D1 is not empty or has an invalid marker, Cloudflare returns ambiguous 403/404, or the Worker already exists, the operation **fails closed without deployment**.
- If the Worker exists but the receipt step did not complete, do **not** rerun blind. An owner must inspect and reconcile script settings and bindings before any further action.
- The workflow should not store credentials in logs or artifacts. Retain the GitHub run URL, exact SHA, review evidence, Cloudflare Worker registration timestamp, and separate stage acceptance signoff.
- Deleting an incorrectly created Worker is a separate owner-approved rollback, not part of this workflow.
- A subsequent authenticated Employee Self-Service staging rollout requires a **different** independently reviewed deployment plan: full isolated application schema, staging-only session and rate-limiting bindings, staff invitation/login, manager review, cross-tenant and mobile tests, privacy/retention acceptance, and separate activation approval.

## Local/offline verification

From the repository root:

`node scripts/employee-self-service-staging-preflight.mjs`

`node --test tests/employee-self-service-staging-boundary.test.mjs tests/employee-self-service-protected-bootstrap-guard.test.mjs`

`npx wrangler deploy --dry-run --config cloudflare/wrangler.employee-self-service-staging.toml`

These commands do not deploy or write to Cloudflare.
