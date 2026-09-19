# Thebe Desk V81 Recovery R1 — Cloudflare launch boundary

This runbook applies only to the reconstructed V81 Recovery R1 successor. It must not be represented as the deleted V81 SHA `361dd8f9d9dc9cdaf19af55b752a198c98ad53e8`.

## Safe-launch posture

Recovery R1 starts with paid checkout disabled (`PAYMENT_PROVIDER=none`) and evidence uploads disabled (`EVIDENCE_UPLOADS_ENABLED=false`). The R2 binding is provisioned so the runtime contract is complete, but no customer evidence upload should be enabled until a production malware-scanning service, scanner secret, and quarantine → scan → clean → authorized-download regression have been independently verified.

The public production origin is `https://thebedesk.com`. `workers.dev` and Worker preview URLs remain disabled. Registration requires a new Invisible Turnstile widget bound to `thebedesk.com` and the corresponding secret must be stored only as a Worker secret.

## Fresh-resource order

1. Authenticate the pinned Wrangler CLI (`4.135.0`) to the intended Cloudflare account.
2. Create a new D1 database named `bw-compliance-os` and privately record its UUID.
3. Create a new private R2 bucket named `bw-compliance-evidence`.
4. Create a new Invisible Turnstile widget for `thebedesk.com`; privately retain its site key and secret.
5. Render an ephemeral production Wrangler configuration with the new D1 UUID, exact public origin, new Turnstile site key, and verified admin/reviewer email lists.
6. Run `cloudflare/preflight-production.sh` before any schema or deploy operation.
7. For a genuinely new D1 only, apply `cloudflare/schema.sql` once. Never replay the full schema against a database containing production state.
8. Provision the seven core Worker secrets: `SESSION_SECRET`, `AUDIT_INTEGRITY_SECRET`, `OPERATIONS_SECRET`, `AUTOMATION_SECRET`, `TURNSTILE_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET`, and `BILLING_WEBHOOK_SECRET`.
9. Deploy using only the rendered ephemeral config.
10. Require `/api/live`, `/api/ready`, anti-bot configuration, registration/login, tenant isolation, role isolation and CSRF/origin smoke tests to pass before launch.
11. Keep evidence uploads disabled until scanner qualification passes. Keep paid checkout disabled until the selected provider is separately qualified.
12. Run the fresh BF-07 exact-SHA seal after GitHub CI is green. Historical BF-07 evidence under `docs/recovery/legacy-bf07/` is not valid launch evidence.

`cloudflare/deploy-free.sh` prints the exact operator sequence and is the source-controlled launch checklist for this recovery line.
