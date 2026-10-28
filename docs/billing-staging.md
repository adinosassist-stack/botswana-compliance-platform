# Isolated billing staging preparation

Related: #1874, #1886 and merged audit consistency fix #1906.

This first slice is a compilable, read-only staging configuration and request
boundary. It does not provision or deploy infrastructure, initialize schemas,
create identities, accept POPs, reconcile bank funds or activate subscriptions.
Authenticated read-only smoke checks have been reported by the staging operator;
full payment and POP acceptance remains outstanding.

The evaluation deployment is unsuitable for this purpose: it uses the production
database variable and evidence bucket. The new configuration fixes a separate
Worker (`bw-billing-staging`), D1 name (`bw-billing-staging`) and R2 bucket
(`bw-billing-staging-pop`) at `https://billing-staging.thebedesk.com`.
The staging operator has deployed that target with the dedicated resources.

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

## Read-only qualification checkpoint

The staging operator reported the following for reviewed source
`86d624fc80c13057ee6ac81a72c53d237405debc`, Worker version
`252df4e7-73b8-44c7-8143-a2354d0058a2`:

- Source identity verification passed after deployment.
- The dedicated marker matched the billing staging database. The database contained
  one designated owner, one tenant and zero payment orders.
- The owner membership was active and its subscription inactive.
- Sign-in, dashboard refresh, billing queues, sign-out and repeat sign-in worked
  without reported errors. The operator reported no layout issue at 375px width.

These are operator-reported smoke results, not independently captured browser or
HTTP acceptance artifacts. The status endpoint's `authenticatedAcceptance:false`
remains unchanged. Production approvals and regulatory controls remain unchanged.

The automated owner-bootstrap suite additionally uses two unrelated customers in
an in-memory database through the actual staging entry and real password login.
It verifies session-bound workspace, identity and order reads even when another
tenant is named in query parameters or a header, rejects customer access to all
three platform billing queues, and checks independent logout. Direct, shadow-path
and root-query transports are covered. A populated manual queue is visible to the
designated platform owner, so customer denial is not tested only against empty data.
These local fixtures never reach Cloudflare and do not qualify live tenant isolation.

Next live acceptance requires independent review of the customer-fixture
provisioner below and separate customer sessions. Activation/replay/refund races and POP upload,
scan and retrieval need their own reviewed staging boundary before execution.
Do not rerun the first-owner bootstrap: its existing-data guard deliberately rejects
an already provisioned database. Do not clear the database to bypass that guard.

## Two unrelated staging customers

`scripts/prepare-billing-staging-customers.mjs` prepares one private SQL import for
`alpha.billing-staging@example.invalid` and `beta.billing-staging@example.invalid`.
It reuses the owner's configuration/identity validation and refuses either test
email in the platform administrator list. It does not connect to Cloudflare.
The source SHA must match the reviewed checkout and rendered configuration.

The SQL requires the matching billing marker, exactly one existing user, tenant,
membership, app state and subscription, with the designated owner's active owner
membership and inactive manual-bank subscription. Payment orders, fulfillments,
entitlement overrides and regulatory principals must be absent. Otherwise the
first statement aborts. Apply the entire file using Wrangler's atomic remote D1
import, never statement by statement. Replay deliberately fails; inspect state
before retrying an unsuccessful import, and never delete data to bypass the guard.

Each customer receives its own user, tenant, active owner membership and fixture
marker in app state. Both subscriptions remain inactive. No orders, submissions,
paid periods, overrides or regulatory permissions are created. Existing owner
credentials and records are preserved. Passwords must differ and each must contain
12–200 characters with no newline. The helper reads exactly two password lines on
stdin, uses the canonical salted PBKDF2 format, and creates the SQL with mode 0600
without overwriting a file. Keep that file and passwords out of chat and artifacts.

Only after independent review, rerender the configuration at the reviewed source,
verify deployment identity and use the authenticated operator's Codespace:

```bash
(
set -e
set +x
umask 077
IFS= read -r -s -p 'New alpha staging password: ' BILLING_ALPHA_PASSWORD
printf '\n'
IFS= read -r -s -p 'New beta staging password (different): ' BILLING_BETA_PASSWORD
printf '\n'
printf '%s\n%s' "$BILLING_ALPHA_PASSWORD" "$BILLING_BETA_PASSWORD" |
  node scripts/prepare-billing-staging-customers.mjs \
    --config /tmp/billing-staging.json \
    --owner-email "$BILLING_STAGING_ADMIN_EMAILS" \
    --database "$BILLING_STAGING_D1_ID" \
    --out /tmp/billing-staging-customers.sql
unset BILLING_ALPHA_PASSWORD BILLING_BETA_PASSWORD
npx wrangler@4.135.0 d1 execute DB --config /tmp/billing-staging.json \
  --remote --file /tmp/billing-staging-customers.sql --yes
rm /tmp/billing-staging-customers.sql
)
```

Use separate browser sessions for alpha and beta. Each `/api/auth/me` must report
its own email/tenant and `platformBillingAdmin:false`; `/api/state` must contain
only its own `billingStagingFixture` marker, even if the other tenant is supplied
in a query parameter or `x-tenant-id` header. All three `/api/platform/billing/`
queues (`subscriptions`, `manual-payments`, `analytics`) must return 403 with
`platform_billing_forbidden` for both customers. The designated platform owner
must retain access. Signing out alpha must invalidate alpha's session while beta
continues working. Record exact source, response statuses and redacted results;
never record cookies, CSRF tokens or passwords. Empty payment queues here cannot
prove populated-order isolation; that remains a separate live fixture qualification.
The automated suites cover populated orders locally and D1 import rollback.
