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

The runtime permits sign-in/out, the side-effect-free POST auth transport probe,
and an explicit set of billing/state reads.
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

## Browser sign-in boundary

A live customer diagnosis established that the prepared password matched and a
same-origin direct staging login returned 200. The browser client nevertheless
defaulted missing `bw-runtime-mode` metadata to production, redirecting the auth
page to the production host; the workspace HTML also retained production mode.
In addition, its mandatory POST transport probe was blocked by the staging allowlist.
Earlier operator-reported browser smoke results must therefore be repeated while
checking the address remains `billing-staging.thebedesk.com`; they do not establish
browser staging acceptance by themselves.

Staging HTML responses now replace existing runtime-mode metadata or insert it
before scripts with `content="staging"`. Shared production assets and their canonical
origin enforcement are unchanged. Only the exact `/api/auth/register-transport-probe`
POST is additionally permitted: the existing worker returns static transport
capabilities after origin validation and before account/database writes. Marker
qualification still precedes delegation. Account registration, payment mutations,
POP intake and regulatory writes remain blocked across all transports.

Regression coverage runs the real API client against rendered auth/workspace HTML,
checks production canonical redirects remain intact, and exercises both customer
logins using the actual client, transport probe and staging worker. It verifies
probe origin rejection and that probes perform only the staging marker read.
After review and deployment, reuse the existing customers; do not provision them
again or reset their passwords to diagnose this browser boundary issue.

## Operator-reported read-only acceptance after the browser fix

The operator deployed source `7c9e312013ea879902afe8a0b55b188d8e5bccb1`
as Worker version `9c1e1c27-8423-451d-91e6-2ba1a98e1ee7` and then reported:

- Alpha and beta signed in and each received its own fixture marker from state.
- With the other customer's `tenantId` query parameter, each still received its own
  marker. An initial empty-state response was traced to the owner session and was
  excluded from the customer results; the check was repeated as the correct customer.
- Both customers received `platform_billing_forbidden` on subscriptions,
  manual-payments and analytics; the designated owner accessed all three endpoints.
- Owner analytics showed three inactive subscriptions, no receipts and no pending
  submissions; the manual queue was empty. No activation was performed.
- With beta in a normal browser session and alpha in a private session, signing out
  alpha produced `unauthenticated` while beta continued returning its own marker.

These are operator-provided responses/confirmations, not independent browser traces.
An API link clicked from another site may trigger `origin_failed`; the operator
repeated checks by pasting API URLs directly into the authenticated window's address
bar. No origin/CSRF restriction was weakened. Populated order isolation, post-fix
375px controls, payment activation and POP upload/scan acceptance remain outstanding.

## Synthetic pending-payment fixtures

After independent review, `scripts/prepare-billing-staging-payments.mjs` can prepare
a single atomic staging import with two business/monthly pending orders (P349 each),
one per existing fixture customer, plus two submitted manual-payment records and
explicit `staging_fixture_created` history. Every order has `synthetic:true`, reviewed
source provenance and a NO FUNDS RECEIVED / NEVER APPROVE notice. Asserted references
start with `STAGING-TEST-NO-FUNDS`; these are not actual bank transaction references.
This is a populated read qualification, not activation evidence or bank reconciliation.

The helper makes no network/database call and requires the same exact-source and
resource validation as the previous provisioners. Its SQL guard requires exactly
three known users/tenants/memberships/states/subscriptions, separate customer tenants,
correct customer markers, active owner memberships, inactive manual-bank subscriptions
with no paid period, and empty payment orders/submissions/events/fulfillments,
entitlement overrides and regulatory principals. Unknown data, wrong scope or replay
aborts before inserts. It does not reset accounts or alter subscriptions. The complete
file must be applied through Wrangler's atomic D1 import, never one statement at a time.

With configuration rendered at the reviewed source, the protected operator prepares:

```bash
PRODUCTION_D1_DATABASE_ID="$PRODUCTION_D1_DATABASE_ID" node scripts/prepare-billing-staging-payments.mjs \
  --config /tmp/billing-staging.json --owner-email "$BILLING_STAGING_ADMIN_EMAILS" \
  --database "$BILLING_STAGING_D1_ID" --out /tmp/billing-staging-payments.sql
```

The output file is private (0600) and cannot overwrite an existing file. Preparation
is separate from the protected remote import. After import, owner manual queue total
must be 2, pending analytics P698, total receipts zero, all subscriptions still inactive.
Each customer must see exactly its own order/submission, including when another tenant
is requested. The existing read-only boundary must continue rejecting owner approval.
Never approve these synthetic fixtures. A later reviewed qualification needs a separate
plan for real test-bank/provider evidence and a safe fixture retirement transition;
do not repurpose fake references as cleared funds. POP schema remains a design candidate
and scanning/privacy requirements must be qualified before uploads can be enabled.

## Populated queue checkpoint and POP identity qualification

The operator deployed reviewed source `cfd9b56fac5036ffd32cb7cce5c9e193e790f007`
as Worker version `5075fbdf-8951-4c1f-9f51-77951754aa34` and confirmed source
identity with all mutation/upload/activation flags still disabled. The guarded
7-statement synthetic fixture import succeeded. Subsequent operator responses showed:

- Owner queue: exactly two submitted synthetic records, each P349, with NO FUNDS
  references and matching alpha/beta metadata.
- Owner analytics: 2 pending / P698, zero receipts, 3 inactive subscriptions.
- Alpha and beta each received only their own P349 pending order despite requesting
  the other tenant ID. An empty response from the owner session was excluded and
  beta's test was repeated after signing in as the correct customer.

These are operator-provided responses, not independently captured live traces.
No synthetic payment was approved or activated. The required separately reconciled
real test bank credit has not been confirmed in this conversation; a generic request
to continue is not bank-credit evidence. Activation remains unqualified.

The dormant POP HTTP handler now allocates its document UUID on the server instead
of accepting `x-pop-document-id`. That legacy header is ignored; it cannot select or
reuse a private storage key. Trusted session tenant/user and the tenant-scoped order
lookup still determine the quarantine scope. Accepted uploads return their allocated
ID and remain pending, non-reviewable and unrelated to bank receipt/activation.

The new HTTP regression uses the real worker authentication/CSRF/tenant route,
in-memory SQLite and local Miniflare R2. The candidate POP schema is created only
inside that local test fixture; it is not a reviewed release migration. Tests cover
missing/forged/colliding caller IDs, private object metadata and scope, validation and
CSRF/tenant failures, compensation after metadata failure, default-off behavior and
continued read-only staging rejection even when a caller supplies an enabled flag.

This narrow identity fix does not enable an upload deployment. Scanner authentication,
quotas, retention/deletion, a governed migration, safe retrieval, audited intake and
idempotent retry/duplicate policy still require qualification before uploads. Each
accepted request currently allocates a new ID; this is not retry deduplication.
WhatsApp/manual intake is not enabled. Production upload flags remain unchanged.

## Upload admission candidate and deployed default-off checkpoint

The operator deployed reviewed source `9214918450ebdc02e19a417713b5a884faaa36cd`
as Worker version `18df7ec1-544e-4d2f-9124-86eb818066b6`. The reported status body
and source header matched; mutation/upload/activation flags remained false. A
reported staging POST response returned 403 `billing_staging_mutations_disabled`.
This confirms a rejection response, not authenticated upload or scan acceptance.

[POP admission/replay candidate](proposals/payment-pop-upload-limits.md) documents
new durable request reservations, conservative caps, atomic metadata completion,
replay conflict handling and uncertain-write reconciliation. Its table remains in
the design candidate SQL only. The reviewed code must not be interpreted as
permission to import that schema or enable uploads. Activation evidence and the
remaining POP scan/privacy/retrieval/retention gates are still outstanding.

## Content-bound scan/retrieval candidate

The [scan/retrieval candidate](proposals/payment-pop-scan-verification.md) replaces
Boolean scanner trust with a signed five-minute content/scope-bound scan request
and result. A clean verdict and its sealed audit commit together; private attachment
responses require the persisted signature, unchanged stored bytes, current owner
context and an atomic access audit. No network transport, provider, route or
scheduled scanner is installed. The current staging runtime strips the proposed
scan/retrieval flags and credentials, and uploads remain disabled. New fields remain
in the candidate schema only; no schema import is authorized by the code change.

## Disabled content-retirement and recovery candidate

The operator reported source `9714e079c3aa750beec4fda9a9d023ab1bcddc8a` at
Worker version `9402f7eb-f3d5-41f8-9e10-6b40ad3d88aa`, with matching status/source
headers and all mutation/upload/activation flags false. This establishes configuration
identity, not live scan/download acceptance.

The [content-retirement/recovery candidate](proposals/payment-pop-retention-recovery.md)
adds audited access revocation before content removal, audited cleanup completion,
and inspection of uncertain uploads without speculative deletion. No retention
period, quota release, live data deletion, route, schedule or schema import is supplied.
The additional timestamp remains only in candidate SQL, and the current runtime
strips both proposed operation flags. Privacy/provider/migration and operational
qualification gates remain outstanding before upload enablement.
# Repeatable authenticated API checkpoint

The operator reported deployment of reviewed merge
`e48d32571cf146ecd8e2b97c43d99c7f8c878c5f`, Worker version
`4cfbf756-94d7-40a5-ad23-4f1985c4532c`. The supplied status response at
2026-10-28 18:08:57 UTC matched that SHA and read-only flags. A subsequent
response returned 403 `billing_staging_mutations_disabled`; the pasted command
contained concatenated URLs, so this records boundary rejection rather than a
clean authenticated POP route trace. No live POP acceptance is claimed.

`scripts/check-billing-staging-acceptance.mjs` supplies a repeatable **API-only**
checkpoint for the existing three accounts and two synthetic pending fixtures.
It uses the fixed staging HTTPS origin, refuses redirects, validates local
resource configuration and exact current checkout/deployment SHA, and verifies
read-only provenance before sending credentials and on every response. It is
not a general production smoke tool and accepts no target URL override.

Passwords are supplied on private stdin in owner/Alpha/Beta order. No password,
cookie, CSRF token, email, tenant identifier, payment reference or response body
is copied into the report. The output is created exclusively with mode 0600;
an existing file is never overwritten. Each request has a 15-second timeout.
The checker creates login sessions and attempts to revoke them on success/failure;
cleanup uncertainty makes the run fail. Login/session timestamps and normal
authentication/rate-limit bookkeeping can change. Business records are only read.
Its only non-authentication POST is an empty, invalid POP staging request with no
file, order, idempotency key or bank assertion, which must be blocked by staging.
It never calls payment approval, subscription mutation or regulatory endpoints.

The expected fixture baseline is deliberately strict: three distinct inactive
tenants, one pending P349 manual order per customer, two labelled synthetic queue
entries, P698 pending, zero receipts, zero active/paused subscriptions. Customer
state and orders must remain their own when another tenant ID is supplied; all
three platform billing reads must deny customers. Alpha logout must revoke Alpha
while Beta and owner sessions continue. A changed fixture or unsupported API
response is a failure requiring investigation, not a reason to reset live data.

After independent review, checkout and staging deployment of the checker revision,
an operator can run the following in the Codespace terminal. Supply staging-only
passwords at the hidden prompts; never paste them into chat. Use a fresh output
filename for every run. The config must already match the exact deployed checkout.

```bash
(
  set -e
  set +x
  umask 077
  IFS= read -r -s -p 'Owner staging password: ' ACCEPTANCE_OWNER
  printf '\n'
  IFS= read -r -s -p 'Alpha staging password: ' ACCEPTANCE_ALPHA
  printf '\n'
  IFS= read -r -s -p 'Beta staging password: ' ACCEPTANCE_BETA
  printf '\n'
  printf '%s\n%s\n%s' "$ACCEPTANCE_OWNER" "$ACCEPTANCE_ALPHA" "$ACCEPTANCE_BETA" |
    PRODUCTION_D1_DATABASE_ID=8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce node scripts/check-billing-staging-acceptance.mjs \
      --config /tmp/billing-staging.json \
      --owner-email thebedesk@gmail.com \
      --database 9d1b8852-4424-46e9-ba24-cdad5ced215f \
      --out /tmp/billing-staging-acceptance.json
)
```

Exit zero and `ok: true` confirm only the listed authenticated API observations
for that run/SHA. On failure, inspect `failedCheck`, `failure` and
`cleanupComplete` in the private report; never share credential diagnostics. If
cleanup is incomplete, session revocation remains unverified. The report always
lists browser login/mobile layout, genuine bank reconciliation/activation, live
POP operations and WhatsApp intake as unverified. Signed-in browser and independent
end-to-end evidence remain required for #1874/#1886. No successful live checker
run is recorded here yet; automated tests use the actual staging entry and real
local SQLite fixtures without contacting Cloudflare.
