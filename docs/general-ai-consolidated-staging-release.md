# General AI: consolidated private-staging qualification

This batch deliberately does not enable General AI in production or expose a public hostname.

## CI qualification
- `General AI research CI` runs staging tests including session HMAC, inactive membership, expired/revoked token, CSRF, origin, tenant/user limiter key and missing-provider fail-closed behavior.
- `General AI private staging qualification` runs only through manual GitHub workflow dispatch on `main`; its default `preflight` mode builds an offline Wrangler bundle without Cloudflare credentials or deployment.
- `deploy-private` is gated by the explicit input `DEPLOY_PRIVATE_GENERAL_AI_STAGING`, a protected GitHub environment named `general-ai-private-staging`, passing preflight, dedicated Cloudflare staging token and account ID secrets. The new environment **must** have an independent reviewer before credentials are configured or deployment requested.

## Operational prerequisites / no-go cases
1. Confirm reviewed source is on current `main` and all required checks pass.
2. Configure the new environment's required independent reviewer `thusico`; do not disable `main-production-governance`.
3. Create a **least-privilege staging-only** Cloudflare deployment token, separate from recovery or production tokens, stored as environment secret `GENERAL_AI_STAGING_CLOUDFLARE_TOKEN`. Store `GENERAL_AI_STAGING_CLOUDFLARE_ACCOUNT_ID` as environment secret. The workflow never logs either value.
4. Reconfirm `bw-general-ai-staging` is private, no workers.dev, no previews, no routes, with isolated D1 `ff229eef-7724-49ae-9d68-d3a1db669b63` and rate limiter namespace `78212078`. Confirm `SESSION_SECRET` binding survives deployment.
5. Deploy with **both AI flags OFF**. Do not insert staging identities, session fixtures, or enable paid providers until follow-on authenticated and approved staging qualification.
6. No public endpoint is provided in this phase. A future reviewed access method must be established before live HTTP smoke tests can run.

## Rollback and protection
If any of the above checks fail, do not dispatch deployment. Restore only the **isolated private staging Worker** from the prior reviewed build via protected workflow, keeping AI OFF. Never copy production D1, R2, passwords, sessions or paid-provider API keys to staging. Do not activate subscriptions based on customer references.

## Missing-credential deployment failure

If the protected job reports either `GENERAL_AI_STAGING_CLOUDFLARE_TOKEN` or
`GENERAL_AI_STAGING_CLOUDFLARE_ACCOUNT_ID` missing, it has not contacted Cloudflare.
Configure these exact secret names in `general-ai-private-staging`, retaining its
independent reviewer. The account ID must be `ddd23cab31928a4bb3d4998df9b26d1d`.
The token must be a separately authorized staging deployment credential; the
read-only operations-rehearsal token cannot deploy Workers. Never copy production
credentials or disclose token values in issues, logs, or chat.

Passing this local presence/account check does not prove token validity, provider
permissions, successful deployment, or launch readiness. Diagnose provider errors
separately after the protected deployment actually reaches Cloudflare.
