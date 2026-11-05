# Protected billing staging deployment handoff (no production writes)

The optional manual workflow `.github/workflows/deploy-billing-staging-protected.yml` is **not enabled as a scheduled or automatic release**. It only accepts `workflow_dispatch` on current `main`, a full current-main SHA, and two modes: `PREFLIGHT_ONLY` (default) or `DEPLOY_APPROVED`. Never use the production deployment environment, production Worker secrets or broad production deployment token.

## Mandatory independent setup before any dispatch

Create the environment **`billing-staging-protected`** in GitHub repository settings. Limit deployments to the protected default `main` branch. Configure required reviewer **`thusico`**, prevent self-review, and do not grant admin bypass. Do **not** auto-create an unprotected environment through a workflow. The job fail-closes if GitHub environment policy cannot be independently authenticated.

Provision only these scoped protected environment values:

| Name | Type | Requirements |
| --- | --- | --- |
| `BILLING_STAGING_ADMIN_EMAILS` | Environment variable | Existing approved designated staging admin(s), matching active Worker setting; do not silently change |
| `BILLING_STAGING_GITHUB_READ_TOKEN` | Environment secret | Independently provisioned GitHub token able to read deployment-environment rules, expires and is auditable; no write access |
| `BILLING_STAGING_CLOUDFLARE_TOKEN` | Environment secret | Independently reviewed restricted Cloudflare token for **only** existing billing-staging Worker metadata / deployment and dedicated D1 Read + R2 metadata + Worker domain inspection; not production |
| `BILLING_STAGING_SESSION_SECRET` | Environment secret | **Existing** staging-only SESSION_SECRET securely preserved by the staging operator, not an invented/replacement value |
| `BILLING_STAGING_AUDIT_INTEGRITY_SECRET` | Environment secret | **Existing** staging-only audit-integrity secret preserved by operator; never source control/chat/CI artifact |

The current staging Worker has **existing live synthetic accounts and sessions**. An accidental secret change can invalidate sessions and break audit integrity. The new workflow cannot read the old Worker secret values (correctly), so operator must independently confirm both values are the same as the secrets currently bound to staging before any `DEPLOY_APPROVED` run. If not, **HOLD**, do not rotate opportunistically. Staging resource isolation is fixed to D1 `9d1b8852-4424-46e9-ba24-cdad5ced215f`, private R2 `bw-billing-staging-pop`, public origin `billing-staging.thebedesk.com`. Keep `PAYMENT_PROVIDER=none`, `POP_UPLOAD_STAGING_ENABLED=false`, and all billing writes disabled. The account ID is fixed in the workflow.

## Two separately authorized operations

- **Preflight:** enter exact reviewed `main` SHA, `mode=PREFLIGHT_ONLY`, `authorization=PREFLIGHT_ONLY`. Protected environment rules, offline tests, read-only Cloudflare metadata, fixed DB marker and Wrangler dry-run must all pass. It does not deploy, change records or collect customer payments.
- **Deployment:** only after human-reviewed preflight evidence and independent `thusico` approval of the **protected environment run**, set `mode=DEPLOY_APPROVED`, `authorization=DEPLOY_READONLY_BILLING_STAGING` and the same exact still-current main SHA. The workflow refuses source drift, changed admin identity, production binding, exposed R2, missing existing secret bindings, unprotected environment and disabled safety flags. This is a staging Worker code/config deploy only; **no D1 schema migration or payment mutation**.

Review GitHub's protected environment configuration and Cloudflare token policies manually: metadata-only APIs do not prove token least privilege, current Worker-version source bytes or ownership of old staging secrets. The workflow cannot verify that all bundle assets preserve old client session behavior. Preserve the prior Worker deployment/version ID for rollback. A failed postdeploy gate is a HOLD; do not blindly retry or roll back without reviewing the deployment and customer sessions.

After an approved deploy, check `GET /api/billing-staging/status` for exact SHA and read-only flags. Then run `scripts/check-billing-staging-acceptance.mjs` with securely entered owner+Alpha+Beta staging passwords and confirm all three session revocations. Bank-funds reconciliation, a writable synthetic staging payment lane, production POP schema 070/071 and **real customer activation** remain separately gated. Customer-supplied screenshots/references never prove cleared funds.

Review requirement: source PR needs independent `thusico` review and all mandatory CI; the source PR approval is **not** the separate protected environment deployment approval. Track evidence and holds in issue #1950.
