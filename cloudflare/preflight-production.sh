#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WRANGLER_TOML=${1:-"$SCRIPT_DIR/wrangler.toml"}

fail() {
  echo "Cloudflare production preflight failed: $1" >&2
  exit 1
}

[ -f "$WRANGLER_TOML" ] || fail "wrangler.toml not found"

grep -Eq '^workers_dev[[:space:]]*=[[:space:]]*false[[:space:]]*$' "$WRANGLER_TOML" || fail "workers_dev must be false"
grep -Eq '^preview_urls[[:space:]]*=[[:space:]]*false[[:space:]]*$' "$WRANGLER_TOML" || fail "preview_urls must be false"
grep -Fq 'pattern = "thebedesk.com"' "$WRANGLER_TOML" || fail "thebedesk.com custom-domain route is missing"
grep -Eq '^custom_domain[[:space:]]*=[[:space:]]*true[[:space:]]*$' "$WRANGLER_TOML" || fail "custom-domain routing must be enabled"
for secret in SESSION_SECRET AUDIT_INTEGRITY_SECRET OPERATIONS_SECRET AUTOMATION_SECRET TURNSTILE_SECRET_KEY PAYMENT_WEBHOOK_SECRET BILLING_WEBHOOK_SECRET; do
  grep -Fq "\"$secret\"" "$WRANGLER_TOML" || fail "required secret contract is missing $secret"
done
for optional_secret in GOOGLE_OAUTH_CLIENT_SECRET FACEBOOK_APP_SECRET RESEND_API_KEY; do
  if grep -Eq "^required[[:space:]]*=.*\"${optional_secret}\"" "$WRANGLER_TOML"; then
    fail "deferred optional secret must not be launch-required: $optional_secret"
  fi
done
if grep -Eq '^required[[:space:]]*=.*EVIDENCE_SCAN_SECRET' "$WRANGLER_TOML"; then fail "EVIDENCE_SCAN_SECRET must not be required while evidence uploads are disabled"; fi
grep -Eq '^keep_vars[[:space:]]*=[[:space:]]*true[[:space:]]*$' "$WRANGLER_TOML" || fail "keep_vars must be true so optional dashboard vars are not deleted by deploy"
grep -Eq '^APP_ENV[[:space:]]*=[[:space:]]*"production"[[:space:]]*$' "$WRANGLER_TOML" || fail "APP_ENV must be production"
grep -Eq '^AI_FEATURES_DEFAULT[[:space:]]*=[[:space:]]*"on"[[:space:]]*$' "$WRANGLER_TOML" || fail "AI_FEATURES_DEFAULT must be on for the Phase 0 production launch"
grep -Eq '^PAYMENT_PROVIDER[[:space:]]*=[[:space:]]*"(none|dpo)"[[:space:]]*$' "$WRANGLER_TOML" || fail "PAYMENT_PROVIDER must be none or dpo; orange_money is blocked pending a reviewed readiness fix"

for key in PUBLIC_APP_URL PUBLIC_ORIGIN TURNSTILE_SITE_KEY PLATFORM_ADMIN_EMAILS PLATFORM_REGULATORY_REVIEWERS; do
  grep -Eq "^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"[^\"]+\"[[:space:]]*$" "$WRANGLER_TOML" || fail "$key must be rendered into production config"
  if grep -Eq "^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"REPLACE_WITH_" "$WRANGLER_TOML"; then fail "$key still contains a placeholder"; fi
done

for optional_key in GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_REDIRECT_URI FACEBOOK_APP_ID FACEBOOK_OAUTH_REDIRECT_URI EMAIL_FROM; do
  grep -Eq "^[[:space:]]*${optional_key}[[:space:]]*=[[:space:]]*\"[^\"]*\"[[:space:]]*$" "$WRANGLER_TOML" || fail "$optional_key must be rendered, even when deferred"
  if grep -Eq "^[[:space:]]*${optional_key}[[:space:]]*=[[:space:]]*\"REPLACE_WITH_" "$WRANGLER_TOML"; then fail "$optional_key still contains a placeholder"; fi
done

grep -Eq '^[[:space:]]*EVIDENCE_SCAN_API_URL[[:space:]]*=[[:space:]]*"[^"]*"[[:space:]]*$' "$WRANGLER_TOML" || fail "EVIDENCE_SCAN_API_URL must be present in rendered production config"
if grep -Eq '^[[:space:]]*EVIDENCE_SCAN_API_URL[[:space:]]*=[[:space:]]*"REPLACE_WITH_' "$WRANGLER_TOML"; then fail "EVIDENCE_SCAN_API_URL still contains a placeholder"; fi
UPLOADS_ENABLED=$(sed -n 's/^[[:space:]]*EVIDENCE_UPLOADS_ENABLED[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")
[ "$UPLOADS_ENABLED" = "false" ] || fail "EVIDENCE_UPLOADS_ENABLED must remain false until an approved scanner provider is configured"
SCAN_URL=$(sed -n 's/^[[:space:]]*EVIDENCE_SCAN_API_URL[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")
[ -z "$SCAN_URL" ] || fail "EVIDENCE_SCAN_API_URL must be empty while evidence uploads are disabled"
PUBLIC_APP=$(sed -n 's/^[[:space:]]*PUBLIC_APP_URL[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")
PUBLIC_ORIGIN_VALUE=$(sed -n 's/^[[:space:]]*PUBLIC_ORIGIN[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")
[ "$PUBLIC_APP" = "$PUBLIC_ORIGIN_VALUE" ] || fail "PUBLIC_APP_URL and PUBLIC_ORIGIN must match exactly"
printf '%s\n' "$PUBLIC_APP" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$' || fail "PUBLIC_APP_URL/PUBLIC_ORIGIN must be a credential-free HTTPS origin"
PUBLIC_BASE=${PUBLIC_APP%/}
GOOGLE_CLIENT_ID_VALUE=$(sed -n 's/^[[:space:]]*GOOGLE_OAUTH_CLIENT_ID[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")
GOOGLE_REDIRECT=$(sed -n 's/^[[:space:]]*GOOGLE_OAUTH_REDIRECT_URI[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")
FACEBOOK_APP_ID_VALUE=$(sed -n 's/^[[:space:]]*FACEBOOK_APP_ID[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")
FACEBOOK_REDIRECT=$(sed -n 's/^[[:space:]]*FACEBOOK_OAUTH_REDIRECT_URI[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")
EMAIL_FROM_VALUE=$(sed -n 's/^[[:space:]]*EMAIL_FROM[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$WRANGLER_TOML")

if [ -n "$GOOGLE_CLIENT_ID_VALUE" ]; then
  [ "$GOOGLE_REDIRECT" = "$PUBLIC_BASE/api/auth/oauth/google/callback" ] || fail "GOOGLE_OAUTH_REDIRECT_URI must equal the exact same-origin callback"
else
  [ -z "$GOOGLE_REDIRECT" ] || fail "GOOGLE_OAUTH_REDIRECT_URI must be empty while Google OAuth is deferred"
fi
if [ -n "$FACEBOOK_APP_ID_VALUE" ]; then
  [ "$FACEBOOK_REDIRECT" = "$PUBLIC_BASE/api/auth/oauth/facebook/callback" ] || fail "FACEBOOK_OAUTH_REDIRECT_URI must equal the exact same-origin callback"
else
  [ -z "$FACEBOOK_REDIRECT" ] || fail "FACEBOOK_OAUTH_REDIRECT_URI must be empty while Facebook OAuth is deferred"
fi
if [ -n "$EMAIL_FROM_VALUE" ]; then
  printf '%s\n' "$EMAIL_FROM_VALUE" | grep -Eq '@[^[:space:]<>]+\.[^[:space:]<>]+>?$' || fail "EMAIL_FROM must contain a real sender email address when transactional email is enabled"
  printf '%s\n' "$EMAIL_FROM_VALUE" | grep -Eqi 'example\.invalid|example\.com|REPLACE_WITH' && fail "EMAIL_FROM must not be a placeholder" || true
fi

grep -Fq 'binding = "DB"' "$WRANGLER_TOML" || fail "D1 DB binding is missing"
grep -Fq 'database_name = "bw-compliance-os"' "$WRANGLER_TOML" || fail "production D1 database name is missing"
if grep -Fq 'database_id = "REPLACE_WITH_D1_DATABASE_ID"' "$WRANGLER_TOML"; then
  fail "production config still contains the D1 database_id placeholder"
fi
grep -Eq '^database_id[[:space:]]*=[[:space:]]*"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}"[[:space:]]*$' "$WRANGLER_TOML" || fail "production D1 database_id must be a provisioned D1 UUID"

grep -Fq 'binding = "EVIDENCE"' "$WRANGLER_TOML" || fail "R2 EVIDENCE binding is missing"
grep -Fq 'bucket_name = "bw-compliance-evidence"' "$WRANGLER_TOML" || fail "production R2 bucket is missing"

echo "Cloudflare production config preflight passed"
