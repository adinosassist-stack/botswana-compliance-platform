# Employee Self-Service — protected inert staging Worker bootstrap handoff

**Scope:** One-time deployment of an inert, route-free Cloudflare Worker only. This is **not** employee login activation, customer onboarding, a full production-shaped staging environment, or a production migration.

## Dependencies

1. **Already complete:** employee feature [PR #2253](https://github.com/adinosassist-stack/botswana-compliance-platform/pull/2253), bootstrap [PR #2268](https://github.com/adinosassist-stack/botswana-compliance-platform/pull/2268) and security acceptance [PR #2276](https://github.com/adinosassist-stack/botswana-compliance-platform/pull/2276) have merged under independent review and mandatory checks. This handoff is for the separately gated `employee-self-service-staging-protected` deployment environment.
2. Confirm the workflow is present in exact-current `main`. Do not deploy from feature branches, earlier merged-PR SHAs or stale job runs. GitHub branch protection and environment protection are **different** approvals.
3. Inspect Cloudflare D1 **only** `bw-employee-self-service-staging`, UUID `adfa3871-5ecf-4672-8d2f-be9b142d5fc1`, account `ddd23cab31928a4bb3d4998df9b26d1d`. Its marker `employee_self_service_staging_identity` and five employee portal tables were separately verified. The protected guard requires all eight data tables to remain empty with no FK errors.
4. Configure GitHub Actions environment **`employee-self-service-staging-protected`**, selected deployment branch **`main` only**, required reviewer **`thusico`**, **prevent self-review on**, **do not allow admin bypass**. The guard verifies policy via GitHub REST, not the existence of the named environment.
5. Configure two **environment secrets**, not repository-wide secrets:
   - `STAFF_STAGING_GITHUB_READ_TOKEN`: a GitHub credential able to **read this repository's environment settings and selected deployment branch policies**. Grant only the narrow repository administration-read scope required by these endpoints. Do not put the value in chat.
   - `STAFF_STAGING_CLOUDFLARE_TOKEN`: a **short-lived staging-only** credential scoped to bootstrap this Worker and read/query only the isolated D1. Determine minimum permissions by actual review, not a broad production deploy token. Never print or reuse it for production.
6. No `SESSION_SECRET`, staff account, production D1, public hostname, customer payments, POP upload, or external endpoint is needed for this inert status-only Worker.

## Execute, only when all prerequisites are met

Open the GitHub Actions workflow **Protected employee self-service inert staging bootstrap** on protected `main`.

**Stage 1 — independent, read-only remote preflight:** select `mode=preflight`, `authorization=PREFLIGHT_ONLY`, and the exact current 40-hex `expected_main_sha`. The `offline` job performs credential-free tests and a dry-run build. A **separate `protected-preflight` job** then waits for independently protected `employee-self-service-staging-protected` deployment review, uses environment-only credentials to read the GitHub environment policy and Cloudflare isolated D1/Worker state, checks the current `main` SHA and verifies that the Worker is absent. It performs **no deployment** or Cloudflare database mutation. A successful offline job alone is not a successful protected preflight.

**Stage 2 — separately approved one-time bootstrap:** only after fresh preflight evidence and the current exact `main` SHA are confirmed, dispatch a new run using:
- `mode`: `bootstrap-inert`
- `expected_main_sha`: exact current 40-hex `main` commit SHA
- `authorization`: `BOOTSTRAP_INERT_EMPLOYEE_STAGING` (replaces the preflight-only authorization; must not be reused in the preflight job)

The `bootstrap-inert` job **independently** requires protected environment review and reruns the exact SHA check, route-free config checks, adversarial tests, Wrangler offline dry-run, GitHub environment-policy inspection, empty isolated D1 evidence, and proof that the named Worker does **not** already exist. It repeats the source and resource checks immediately before creating the Worker.

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
