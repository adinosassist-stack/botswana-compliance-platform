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

1. Obtain fresh exact-head CI and independent thusico review. Use protected merge
   and the existing production release qualification, exact-SHA owner authorization
   and protected environment approval. This branch adds no deployment workflow or
   alternate production-write path.
2. Verify that the approved release containing the runtime code is deployed.
3. Through private authenticated administration, re-confirm the requested account,
   immutable user ID, tenant ID and active owner membership. Do not place the
   account email or immutable production identifiers in this document or public
   issue/PR comments.
4. Separately approve the bounded production entitlement write under the existing
   production-write process. `setFounderAiEntitlement` in
   `scripts/founder-ai-entitlement.mjs` prepares the operation against a D1 adapter.
   It defaults to inspect-only, requires an approval-run reference for mutations,
   refuses another subject's override and atomically writes the override and audit.
   A run URL is audit evidence only; the trusted executor must verify actual CI,
   approvals and exact source before invoking it. There is deliberately no CLI,
   automatic login grant or newly introduced production executor.
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
