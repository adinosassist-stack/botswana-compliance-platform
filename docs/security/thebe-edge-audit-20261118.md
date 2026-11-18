# Thebe Desk — protected security audit and edge hardening
Observed: 18 November 2026. Tracking: [issue #2317](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2317).

## Review scope and evidence
Read-only GitHub repository ruleset and workflow metadata; read-only Cloudflare production Worker settings, `thebedesk.com` zone settings, manager-staging Access application and policy. No production customer records, D1 SQL, secret values, Worker deployment or Cloudflare mutation were performed. Not a penetration test or compliance certification.

| Finding | Priority | Observed state | Required remediation |
| --- | --- | --- | --- |
| TLS-01 | High | `thebedesk.com` minimum TLS version `1.0` | Confirm client support; plan controlled minimum TLS 1.2 with before/after handshake tests and rollback |
| HTTPS-02 | High | `always_use_https=off` | Verify HTTP routing and login/OAuth callbacks, then independently approve global HTTPS redirection |
| CERT-03 | Medium | SSL mode `full` rather than `strict` | Validate Worker custom-domain/origin configuration and origin certificate before Full (strict); no blind change |
| LOG-04 | Medium | Production Worker logs persist at sampling 0.1; `observability.redact_query_string=false` | Source-controlled Wrangler `redact_query_string=true` with safe metadata verification |
| GOV-05 | Medium | Main ruleset active and strict, four required checks; last-push approval and code-owner review disabled | Independently assess `require_last_push_approval` with owner and `thusico`; do not change ruleset without separate approval |
| ACCESS-06 | Informational | One-hour manager staging Access application with only `banabothem@yahoo.com` allow policy in production-connected account; standalone manager account has no Access app or Worker | Reconcile account/host topology and maintain allowlist before manager staging deployment |

## Implemented in this PR
- Set `[observability] redact_query_string = true` in production Wrangler source.
- Preserve Worker log sampling and existing log enablement.
- Extend fixed-scope, read-only production operations metadata report to include `redactQueryString` **only if observed as a boolean**. Missing provider value remains unknown; it does not masquerade as safe.
- Include an isolated synthetic test with true, false, unknown states and secret-exclusion assertions.
- No Cloudflare write, no TLS/zone change, no Worker version or production D1 migration. The live setting remains as observed until protected deployment.

## Protected acceptance and rollback
1. Rebase or update this PR against current main using the established branch controls. Require all mandatory PR CI and independent `thusico` approval on the final exact SHA.
2. Validate rendered Wrangler TOML against current Wrangler version; run `node --test tests/production-operations-metadata.test.mjs tests/production-logging-query-redaction.test.mjs`.
3. For a separately authorized production deployment: record current settings, exact main SHA, BF-07 seal and recovery evidence, then deploy through existing protected environment.
4. Read the production Worker settings after deploy; verify `observability.redact_query_string=true` with existing sampling, routes, bindings and feature switches unchanged. Verify no sensitive URL parameters are recorded in new telemetry.
5. On regression, use the protected rollback release preserving independent approvals; record incident and the exact before/after Worker version. Query-redaction is not a substitute for keeping secrets out of URLs or logging safe structured events.
6. Zone TLS, HTTPS and strict-origin changes are **separate** changes requiring owner authorization, `thusico` review, compatibility testing and a rollback window. Do not bundle them into this Worker source PR.

## Outstanding larger audit
Cross-tenant authorization and IDOR tests in People/Finance/Assets, payment reconciliation and replay, credential and artifact access, private backup restoration, AI agent privileges and prompt injection, PII log hygiene, and tested alert delivery. Track in #2317; do not claim completed.
