# Founder AI entitlement — source candidate

Tracks #2843. This candidate does not activate an account, change a production
wallet, issue a purchase, deploy a Worker or authorize production SQL.

## Behavior

The authenticated advisor checks an explicit `founder_ai_unmetered` override for
its current tenant. The override must be enabled, have NULL expiry and limit,
and carry the exact `founder_ai_subject:<immutable user ID>` reason. The subject
must still have an active owner membership. Login, owner role or an email address
alone never grants the exemption. Other users, including owners in the same
workspace, retain their existing charging rules. Another workspace requires a
separate approved grant.

Exempt advisor requests record a zero-credit usage entry, actor ID, run reference
and funding source. Responses, persisted advisor runs and canonical run audits
report zero credits. Provider failures do not refund credits that were never
charged. Monthly credit caps do not restrict exempt requests; provider spending
controls, authentication, rate limits, CSRF, authorization and model safety remain.
Scheduled summaries and other credit-consuming features are outside this account
chat/voice scope and retain ordinary charging.

Native live voice already uses an audited provider session without wallet
consumption. Its rate limits, kill switch, session ownership and governed backend
delegation remain unchanged. A synthetic upstream response verifies session
creation without a wallet or ledger change; it does not prove live microphone,
playback, upstream funding or a real spoken conversation.

## Activation and rollback

1. Confirm the latest main merge has an independent thusico approval on its exact
   PR head and successful independent regressions and founder qualification CI.
   Confirm main governance and recovery CI on the exact main merge SHA.
2. Confirm the currently deployed release has a successful BF-07 seal and that
   its entitlement runtime and grant helper match the current main versions.
3. Privately verify the designated account, immutable user ID, tenant ID and
   active owner membership. Configure the verified identity through the protected
   production environment. Keep account identifiers out of public issue and PR
   comments and workflow logs.
4. The owner dispatches `Founder AI protected activation` from main using the
   exact current main SHA as `expected_sha`. Use `inspect` for read-only checks,
   `grant` to activate, or `revoke` to withdraw the entitlement. Keep independent
   production environment approval in the workflow. When main changes before
   activation, verify the new exact SHA and dispatch a fresh run. The executor
   rechecks approval, CI, the deployed release seal, and the live release before
   invoking the bounded, audited D1 helper.
5. Record wallet balance, lifetime usage and purchase state. Grant only this
   identity and feature; verify the zero-expiry override and grant audit, and
   re-read all captured balances to confirm they are unchanged.
6. In the account's signed-in session, send an actual chat question and conduct a
   voice conversation. Re-read the wallet and ledger; confirm zero deductions,
   zero-credit advisor records and the voice session audit. Refresh and sign in
   again to verify persistence. This live acceptance remains pending.
7. Roll back using the same approved operation with `enabled:false`. This records
   a revocation audit, stops new exempt advisor requests and preserves history.
   In-flight requests already authorized and native voice sessions follow their
   existing lifecycle; revocation is not a voice-session kill switch.

Grant/revoke does not create a subscription, settled payment, monthly grant,
provider credit or an application/admin role. The helper contains no production
identity or credentials. Existing production approvals remain mandatory.

## Local verification

- The zero-wallet founder regression fails against the unchanged base with HTTP
  402 and passes against this source with HTTP 200 and zero credits.
- Founder chat, ordinary customer charging, subject and tenant isolation,
  malformed/revoked grants, membership changes, provider failure/refund,
  provider spending guard and failed usage audit are tested against real SQLite.
- Grant/revoke/default inspection/idempotency and transactional audit rollback
  are tested in SQLite and isolated Miniflare D1.
- The existing independent-review workflow runs both founder regression files.
