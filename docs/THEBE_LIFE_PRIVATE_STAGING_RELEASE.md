# Thebe Life — authorized private staging resource and release boundary

Owner authorization received for isolated, private Life staging. This document does **not** grant public-route, production, insurer, payout or customer-record approval.

- Dedicated new Cloudflare D1: `bw-life-staging`, ID `fa58bcb8-5871-4272-b3e8-c8cc2548dcd2`.
- New candidate Worker: `bw-life-staging`, with `workers_dev=false`, `preview_urls=false`, no routes or custom domains.
- Worker entrypoint is deliberately inert: always returns 404; never reads D1 or serves records.
- The schema migration remains unapplied. Staging data must be synthetic only.

## Release steps and independent approval

1. Review and merge the exact approved candidate PR with passing private Worker and existing release checks. Independent `thusico` review is mandatory.
2. Create an environment named `thebe-life-private-staging` in GitHub with required reviewer `thusico`, prevent self-review, and restrict deployments to `main`. Verify its effective settings before enabling any deploy workflow.
3. Configure a **dedicated** Cloudflare token with only the account's necessary Worker deployment permissions. Do not reuse production, POP, backup, or billing tokens.
4. Ensure the allowed source SHA equals the exact reviewed `main` commit. Perform a reviewed dry run and deploy the inert Worker only through the protected environment.
5. Verify the uploaded Worker has **no routes and no worker.dev/preview URLs**, with `THEBE_LIFE_HOUSEHOLD_ENABLED=false` and all financial flags false.
6. Recheck the resource is isolated from production D1. Apply a separately reviewed D1 migration to the dedicated synthetic staging DB only; validate full schema constraints before enabling any read-only tester APIs.
7. Do not activate authenticating users, public navigation, insurance, contributions, payouts or real customer data during this phase.

**No deployment job is included in this PR.** The initial workflow runs build/dry-run only. A separate future protected deployment action must be reviewed and implemented after environment protection is verified.
