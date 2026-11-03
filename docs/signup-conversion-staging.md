# Isolated signup/conversion staging candidate

This is a reviewable configuration and runtime boundary, not a deployed service.
It does not change billing staging, regulatory staging, production registration,
branch protection, or production telemetry activation. Related PR: #1944.

The proposed Worker is `bw-signup-conversion-staging`, with a dedicated D1 named
`bw-signup-conversion-staging` and planned hostname `signup-staging.thebedesk.com`.
The renderer requires its database UUID plus the independently verified production,
billing-staging and regulatory-staging UUIDs, and rejects reuse of any of them.
Known production/regulatory IDs are also excluded. IDs and the database marker
are configuration safeguards; provider metadata must independently prove isolation.

Only `alpha.signup-staging@example.invalid` and
`beta.signup-staging@example.invalid` may register or sign in. The canonical
cohort gate, durable registration proof and normal session/CSRF boundaries remain.
Registration creates synthetic users, tenants, owner memberships and trial
subscriptions in this dedicated database. Successful login writes staging sessions.
Conversion admission writes staging audit events and consumes the staging rate
limiter. These are explicit staging writes, not production or read-only operations.

The request allowlist permits only registration proof, fixture registration/login,
logout, the transport probe, conversion events, required identity/state/billing-status
reads, and the public/auth/workspace HTML and static assets. Unknown APIs and
payment return GETs are denied. Payment approvals, refunds, POP uploads, external
OAuth, password reset delivery, regulatory writes, employee writes, AI/agent
execution and all other mutations are denied across direct, shadow and root-query
transports. The wrapper has no scheduled handler, R2, AI or queue binding and
does not forward provider, email, scanner or automation credentials.

Before deployment, the independent reviewer and staging operator must verify:

1. The exact reviewed checkout SHA and all four provider-side database identities.
2. A new empty database containing no production/customer data; initialize only
   the reviewed consolidated schema and its numbered forward migrations, as
   exercised by `installShadowTelemetrySchema` in the test helper.
3. Fresh staging-only session/audit secrets, the new Worker/hostname, and a
   dedicated rate-limiter namespace with no collision with other deployed Workers.
4. The rendered configuration points exclusively to the dedicated database.
   Install the identity marker only after those checks. Marker SQL is intentionally
   not replayable and must never be run in production or existing staging targets.

The environment inputs are `SIGNUP_STAGING_D1_ID`, `PRODUCTION_D1_DATABASE_ID`,
`BILLING_STAGING_D1_ID`, `REGULATORY_STAGING_D1_ID`, and
`SIGNUP_STAGING_SOURCE_SHA`. The source SHA must equal `git rev-parse HEAD`
at the independently reviewed checkout. These commands only prepare local files:

```bash
node scripts/render-signup-conversion-staging-config.mjs > /tmp/signup-staging.json
node scripts/render-signup-conversion-staging-config.mjs --marker-sql > /tmp/signup-staging-marker.sql
```

Provider resource creation, schema/marker installation, secrets and deployment
remain separate operator actions; this PR adds no remote-write workflow. Never
reuse production secrets, import customer records or relax an existing staging
profile to obtain signup access. Fixture passwords must be newly chosen by the
operator and kept out of chat, source, logs and CI artifacts.

After the operator deploys the exact reviewed revision, retain redacted evidence of:

- Source header and `/api/signup-staging/status` matching the reviewed SHA.
  `authenticatedAcceptance:false` is deliberate; status is not an acceptance proof.
- Both fixture accounts completing the real browser signup/proof/sign-in flow,
  keeping independent sessions and tenant-scoped workspace/state reads.
- Exactly one signup-success event per newly committed account. Existing-account
  attempts with fresh proofs retain the generic 202 response and emit no success.
- Transport replay and disabled-route rejection without additional accounts,
  payments, entitlement changes or regulatory activation.
- Desktop and mobile entry, explicit logout, redacted event counts, and a separately
  reviewed fixture-retention/cleanup decision. No destructive cleanup is automated.

Local SQLite tests establish schema compatibility and boundary behavior, not
Cloudflare D1 provider isolation, live browser acceptance or permission to deploy.
