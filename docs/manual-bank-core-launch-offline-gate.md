# Manual-bank core launch — consolidated offline gate

This batch adds **one scoped CI gate** covering the existing owner payment evidence, D1 allocation tests, actual Worker manual-bank review route, audit/recovery, owner dashboard, subscription access and core-only release freeze.

## What it proves
- The reviewed repository version's existing code and tests qualify for a **manual-bank core-only candidate** with POP ingestion and advanced General AI exports still disabled.
- Customer bank-transfer references, screenshots and POP uploads never substitute for **matching, independently visible cleared funds in the company's bank account**.
- Local D1 and synthetic tests validate paid fulfillment, review resumption, audit-chain failure rollback, tenant scoping, subscription pause/resume and expiry checks.
- The production POP route and production configuration remain disabled under source-level freeze checks.

## What it does not prove
This is **not** a deployment. There is no live bank feed, authenticated deployed Worker/session acceptance, production payment approval, refund, migration, customer entitlement change, provider charge or cloud credential. Passing does not mean the deployed Worker matches the tested commit.

## Protected go/no-go sequence
1. Independently review/merge the candidate under `main-production-governance` with `thusico` and all required CI.
2. Use read-only authenticated Cloudflare inspection to compare deployed production freeze flags with the reviewed source, and inspect actual core payment table shape/status, with no identifying customer data.
3. Align the isolated read-only billing staging deployment with a reviewed exact source SHA **only after staging deployment authorization**, preserving its dedicated D1 and R2 and no billing mutations.
4. Run the existing owner + alpha + beta signed-in acceptance via `scripts/check-billing-staging-acceptance.mjs` with fresh staging-only passwords **supplied securely**, no chat/GitHub secret values, and verify complete session cleanup.
5. For real payments, independently reconcile cleared company-bank funds; obtain separately authenticated owner approval and verify the paid fulfillment. The submitted payment reference alone never activates a subscription.
6. POP 070 then 071 production schema and upload/scan capability require separate protected recovery, restore, exact-SHA phase approvals and independent reviewer acceptance. Core-only scope must continue to report POP not ready, not silently manufacture readiness.
7. Exact current-main independent production approval, protected deployment, authenticated live payment acceptance, rollback and monitoring are distinct gates.

No small duplicate PRs or unreviewed production changes should be required to use this CI gate. See issue #1950.
