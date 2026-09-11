# Secrets Management

Production supports direct environment variables and Docker/Kubernetes-style secret files using `<NAME>_FILE` for the Node profile. Recommended secret-file variables include:

- `DATABASE_URL_FILE`
- `SESSION_SECRET_FILE`
- `OBJECT_STORE_ACCESS_KEY_ID_FILE`
- `OBJECT_STORE_SECRET_ACCESS_KEY_FILE`
- `MALWARE_SCAN_WEBHOOK_SECRET_FILE`
- `RETENTION_JOB_SECRET_FILE`
- `TURNSTILE_SECRET_KEY_FILE`

Privileged production secrets must be independent high-entropy values. Do not reuse one secret across controls.

- `AUDIT_INTEGRITY_SECRET` — audit-ledger/control-lineage HMAC integrity.
- `RETENTION_JOB_SECRET` — destructive Node retention/deletion maintenance authorization; minimum 32 characters and protected by durable IP/global attempt budgets.
- `AUTOMATION_SECRET` — internal Worker automation authorization; minimum 32 characters and deployment-readiness checked.
- `OPERATIONS_SECRET` — internal professional-service/operations authorization; minimum 32 characters.
- `PAYMENT_WEBHOOK_SECRET` — public payment webhook authentication; minimum 32 characters and independent from internal billing credentials.
- `BILLING_WEBHOOK_SECRET` — internal payment verification, reconciliation and refund authorization; minimum 32 characters.
- `TURNSTILE_SECRET_KEY` — server-side registration challenge verification. Never expose it in browser HTML or public configuration responses.
- `TURNSTILE_SITE_KEY` — public site key; safe to expose to the registration page and required in production.

Do not commit production secrets to `.env`, container images, source control, screenshots, tickets or chat. Rotate credentials after suspected exposure. `scripts/generate-secrets.sh` can generate strong initial values, but deployment should inject them through the hosting platform's secret manager.
