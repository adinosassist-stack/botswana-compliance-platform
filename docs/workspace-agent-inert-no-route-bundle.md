# Workspace Agent — Stage A inert Worker bundle (dry-run only)

**This PR contains source files and a CI build check only. It does not create, upload, publish, deploy or activate any Worker, D1 database, DNS route or Cloudflare Access policy.** See issue #2433 and the merged Stage-A design PR #2434.

## Exact proposed files

- `cloudflare/src/workspace-agent-staging-inert-entry.js`: a **standalone** entrypoint, not imported by the production Worker, which returns a fixed, no-store HTTP 404 to *every* request. No authentication, task execution, sessions, background queues, database calls, fetch to another service, or customer data access.
- `cloudflare/wrangler.workspace-agent-staging.inert.toml`: a proposed, **unpublished** named Worker `bw-workspace-agent-staging` configured with `workers_dev=false`, `preview_urls=false`, `keep_vars=false`, **zero routes**, no static assets, no D1/R2/KV/Queue or service bindings, no custom domains and no secrets. `APP_ENV=staging`, `WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED=false`, General AI/autonomy/voice/POP flags off, and `PAYMENT_PROVIDER=none`.
- `tests/workspace-agent-inert-staging-bundle.test.mjs`: pure checks ensuring exact Wrangler options and no extra bindings; each method/path (including task, auth and ready) returns the **same 404** under synthetic production-looking credentials.
- `.github/workflows/workspace-agent-inert-bundle-dry-run.yml`: GitHub read-only, checks tests, then runs **`wrangler deploy --dry-run` only**, never `wrangler deploy` without `--dry-run`. It retains a 7-day checksum-verified bundle receipt and source SHA. For manual dispatch, it requires the current main commit SHA and confirms it again after the dry run.

## Why this is deliberately not a browser preview

With workers.dev, preview URLs, public routes and custom hostnames disabled, **the Worker is unreachable over HTTP even if independently provisioned later**. A dry-run bundle cannot verify Cloudflare Access, private admission, staging users, real DB tenant separation, or Agent UI activation.

The currently merged Cloudflare Agent advisory gate (PR #2432) additionally requires an explicit HTTPS staging hostname and verified session. Do not enable that flag or add a hostname for this inert bundle. The alternative architecture (private browser admission through Access-protected hostname vs another approved private transport) remains undecided in issue #2433.

## Independent approvals are separate

The code can be reviewed and merged without authorizing *any* remote action. Before a later version-only Worker upload, resource provisioning, database migration, network route, protected browser test, or Agent activation, the owner must explicitly authorize that distinct operation at an exact current source SHA; independent `thusico` review, isolated synthetic-only resources, least-privilege permissions, rollback and a dedicated protected staging environment must also be verified.

The existing 17 D1 databases and six Workers are not to be reused as this staging plan's resources without a separately approved architecture change. The proposed Worker and D1 resource names were absent from the 14 Nov 2026 GET-list snapshot but are not reservations or proof of future availability.

**Production is unchanged and remains out of scope.**
