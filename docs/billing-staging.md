# Isolated billing staging preparation

Related: #1874, #1886 and merged audit consistency fix #1906.

This first slice is a compilable, read-only staging configuration and request
boundary. It does not provision or deploy infrastructure, initialize schemas,
create identities, accept POPs, reconcile bank funds or activate subscriptions.
No authenticated staging acceptance has been demonstrated.

The evaluation deployment is unsuitable for this purpose: it uses the production
database variable and evidence bucket. The new configuration fixes a separate
Worker (`bw-billing-staging`), D1 name (`bw-billing-staging`) and R2 bucket
(`bw-billing-staging-pop`) at `https://billing-staging.thebedesk.com`.
That address is a proposed target, not an assertion that it exists.

The renderer requires an explicit staging database UUID and current production
database UUID. It rejects equality, the known production UUID and the separate
regulatory staging UUID. It accepts only an exact source SHA and explicitly designated
staging administrator emails. An address may also be used in production, but its
staging user, password, memberships and sessions must be independently provisioned.
In this staging profile, the owner helper neither injects a production administrator
email nor repairs memberships, entitlements or regulatory principals during login.
The configuration contains no production route, AI binding or scheduled handler.

The runtime permits sign-in/out and an explicit set of billing/state reads.
Existing session, tenant, CSRF and platform-owner checks remain in the downstream
application. It rejects all other writes, including payment approval, pause/resume,
registration, POP uploads, webhook intake, agent actions and regulatory publication.
It also rejects the payment return GET route, which can perform reconciliation.
Direct, shadow-path and root-query API transports use the existing normalizer.
Integration credentials are not forwarded, and safety flags are forced off.

Before delegating even login, the runtime reads a staging identity marker. Missing
or mismatched markers fail closed before session writes. This guards accidental
binding errors; it does not replace provider-side resource identity checks.
`GET /api/billing-staging/status` reports configuration/source identity only and
explicitly returns `authenticatedAcceptance:false`. The application's `/api/ready`
may remain unavailable until schema and dedicated configuration are qualified.

## Provisioning handoff

An authorized infrastructure operator must first provide a dedicated D1 database,
private R2 bucket with public managed/custom domains disabled, staging domain and
credentials scoped to these resources. Verify provider metadata, ownership and
production exclusion before importing any schema or adding the identity marker.
Use the reviewed application schema and migration requirements for the chosen
revision; POP schema is still a proposal and must not be silently applied.
Use fresh staging session/audit secrets, never production secrets or copied data.

Set `BILLING_STAGING_D1_ID`, `PRODUCTION_D1_DATABASE_ID`,
`BILLING_STAGING_SOURCE_SHA` (the independently reviewed exact revision) and
`BILLING_STAGING_ADMIN_EMAILS` in the operator's protected environment. Then:

```bash
node scripts/render-billing-staging-config.mjs > /tmp/billing-staging.json
node scripts/render-billing-staging-config.mjs --marker-sql > /tmp/billing-staging-marker.sql
```

These commands only render local files. Marker SQL intentionally refuses replay
on an existing marker. Schema initialization, marker installation, test-account
provisioning and deployment are separate protected operator actions, absent from
the qualification workflow. Do not insert the marker into production or regulatory
staging. The dedicated billing owner and unrelated customer need separate sessions;
no credentials, accounts, payment fixtures or bank confirmations are invented here.

After independent review and provisioning, deploy this read-only slice and record
its exact source SHA, provider isolation evidence and authenticated desktop/375px
read checks. A later reviewed slice must explicitly authorize staging fixtures and
selected billing mutations before testing activation, replay, refund races and POP
scan/retrieval workflows. Cleared bank-credit reconciliation remains a human gate.

## Verification

`node --test tests/billing-staging-boundary.test.mjs` exercises configuration,
forbidden resources, API transports, credential isolation and marker failures.
The billing staging qualification workflow also runs existing billing/D1/POP
regressions and a pinned Wrangler `deploy --dry-run`. It has no provider credentials
or remote write step. These checks qualify preparation only, not a live deployment.
