#!/usr/bin/env bash
set -euo pipefail
secret(){ openssl rand -base64 48 | tr -d '\n'; }
cat <<VALUES
# Generate once, store in the deployment secret manager, then delete this output.
# Provider-issued credentials (Turnstile, DPO, OAuth, R2, WhatsApp) are intentionally not generated here.
SESSION_SECRET=$(secret)
AUDIT_INTEGRITY_SECRET=$(secret)
RETENTION_JOB_SECRET=$(secret)
AUTOMATION_SECRET=$(secret)
OPERATIONS_SECRET=$(secret)
PAYMENT_WEBHOOK_SECRET=$(secret)
BILLING_WEBHOOK_SECRET=$(secret)
MALWARE_SCAN_WEBHOOK_SECRET=$(secret)
EVIDENCE_SCAN_SECRET=$(secret)
POSTGRES_PASSWORD=$(secret)
VALUES
