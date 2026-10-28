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
Staging responses override inherited production SHA/release headers. HTML asset
and client identities and readiness JSON use the staging SHA too; readiness errors
remain errors and are not promoted to successful acceptance.

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

## First staging owner account

After this helper is independently reviewed, rerender the configuration at that
exact checked-out revision and deploy it. `scripts/prepare-billing-staging-owner.mjs`
then prepares an insert-only SQL file from a password supplied on stdin. It makes
no network or database calls. Its configuration must match the checkout SHA,
explicitly designated email, expected dedicated database UUID and safe profile.

The SQL itself requires the matching staging identity marker and zero users,
tenants and payment orders immediately before its inserts. Existing data or a
wrong marker aborts the bootstrap; it cannot reset an existing password. It creates
one user, one owner membership, empty app state and an **inactive** subscription.
It creates no payments, paid periods, entitlement overrides or regulatory principals.
The password format matches the canonical Worker verifier (PBKDF2-SHA256, 100,000
iterations, fresh 16-byte salt); the generated SQL file contains its salted hash.

With the reviewed configuration and variables from the provisioning handoff:

```bash
(
set -e
set +x
umask 077
read -r -s -p 'New staging-only password: ' BILLING_STAGING_PASSWORD
printf '\n'
printf '%s' "$BILLING_STAGING_PASSWORD" | node scripts/prepare-billing-staging-owner.mjs \
  --config /tmp/billing-staging.json --email "$BILLING_STAGING_ADMIN_EMAILS" \
  --database "$BILLING_STAGING_D1_ID" --out /tmp/billing-staging-owner.sql
unset BILLING_STAGING_PASSWORD
npx wrangler@4.135.0 d1 execute DB --config /tmp/billing-staging.json \
  --remote --file /tmp/billing-staging-owner.sql --yes
rm /tmp/billing-staging-owner.sql
)
```

Choose a fresh staging password locally. No password or generated SQL contents
belong in chat, GitHub or CI artifacts. If preparation/import fails, inspect the
error and staging state before retrying. A successful import still needs an actual
staging login, owner capability checks and unrelated-customer isolation tests.
Public registration stays on hold and billing mutations remain disabled.

## Verification

`node --test tests/billing-staging-boundary.test.mjs` exercises configuration,
forbidden resources, API transports, credential isolation and marker failures.
The billing staging qualification workflow also runs existing billing/D1/POP
regressions and a pinned Wrangler `deploy --dry-run`. It has no provider credentials
or remote write step. These checks qualify preparation only, not a live deployment.
