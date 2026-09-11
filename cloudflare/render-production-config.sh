#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TEMPLATE=${1:-"$SCRIPT_DIR/wrangler.toml"}
D1_ID=${D1_DATABASE_ID:-}
PAYMENT_MODE=${PAYMENT_PROVIDER_OVERRIDE:-none}
PUBLIC_APP=${PUBLIC_APP_URL:-}
PUBLIC_ORIGIN_VALUE=${PUBLIC_ORIGIN:-}
TURNSTILE_SITE=${TURNSTILE_SITE_KEY:-}
PLATFORM_ADMINS=${PLATFORM_ADMIN_EMAILS:-}
PLATFORM_REVIEWERS=${PLATFORM_REGULATORY_REVIEWERS:-}
SCAN_URL=${EVIDENCE_SCAN_API_URL:-}

fail() {
  echo "Cloudflare production config render failed: $1" >&2
  exit 1
}

[ -f "$TEMPLATE" ] || fail "wrangler.toml template not found"
printf '%s\n' "$D1_ID" | grep -Eq '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$' || fail "D1_DATABASE_ID must be the provisioned D1 UUID"

case "$PAYMENT_MODE" in
  none|dpo) ;;
  *) fail "PAYMENT_PROVIDER_OVERRIDE must be none or dpo; orange_money remains blocked until its readiness control is fixed and reviewed" ;;
esac

# Keep the production URL contract deliberately narrow: one exact HTTPS origin in both variables.
[ -n "$PUBLIC_APP" ] || fail "PUBLIC_APP_URL is required"
[ "$PUBLIC_APP" = "$PUBLIC_ORIGIN_VALUE" ] || fail "PUBLIC_APP_URL and PUBLIC_ORIGIN must be the same exact HTTPS origin"
printf '%s\n' "$PUBLIC_APP" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$' || fail "PUBLIC_APP_URL/PUBLIC_ORIGIN must be a credential-free HTTPS origin with no path, query or fragment"

printf '%s\n' "$TURNSTILE_SITE" | grep -Eq '^[A-Za-z0-9._-]{10,256}$' || fail "TURNSTILE_SITE_KEY is required and malformed"
printf '%s\n' "$PLATFORM_ADMINS" | grep -Eq '^[^[:space:],@]+@[^[:space:],@]+\.[^[:space:],@]+(,[^[:space:],@]+@[^[:space:],@]+\.[^[:space:],@]+)*$' || fail "PLATFORM_ADMIN_EMAILS must be a comma-separated non-empty email list"
printf '%s\n' "$PLATFORM_REVIEWERS" | grep -Eq '^[^[:space:],@]+@[^[:space:],@]+\.[^[:space:],@]+(,[^[:space:],@]+@[^[:space:],@]+\.[^[:space:],@]+)*$' || fail "PLATFORM_REGULATORY_REVIEWERS must be a comma-separated non-empty email list"
UPLOADS_ENABLED=$(sed -n 's/^[[:space:]]*EVIDENCE_UPLOADS_ENABLED[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$TEMPLATE")
if [ "$UPLOADS_ENABLED" = "true" ]; then
  printf '%s\n' "$SCAN_URL" | grep -Eq '^https://[^[:space:]"<>@]+$' || fail "EVIDENCE_SCAN_API_URL must be credential-free HTTPS when evidence uploads are enabled"
elif [ -n "$SCAN_URL" ]; then
  printf '%s\n' "$SCAN_URL" | grep -Eq '^https://[^[:space:]"<>@]+$' || fail "EVIDENCE_SCAN_API_URL must be empty or credential-free HTTPS while evidence uploads are disabled"
fi

TOTAL_IDS=$(grep -Ec '^[[:space:]]*database_id[[:space:]]*=' "$TEMPLATE" || true)
PLACEHOLDERS=$(grep -Ec '^[[:space:]]*database_id[[:space:]]*=[[:space:]]*"REPLACE_WITH_D1_DATABASE_ID"[[:space:]]*$' "$TEMPLATE" || true)
PAYMENT_LINES=$(grep -Ec '^[[:space:]]*PAYMENT_PROVIDER[[:space:]]*=' "$TEMPLATE" || true)
SAFE_PAYMENT_DEFAULTS=$(grep -Ec '^[[:space:]]*PAYMENT_PROVIDER[[:space:]]*=[[:space:]]*"none"[[:space:]]*$' "$TEMPLATE" || true)
[ "$TOTAL_IDS" -eq 1 ] || fail "template must contain exactly one D1 database_id"
[ "$PLACEHOLDERS" -eq 1 ] || fail "template must contain exactly one D1 database_id placeholder"
[ "$PAYMENT_LINES" -eq 1 ] || fail "template must contain exactly one PAYMENT_PROVIDER"
[ "$SAFE_PAYMENT_DEFAULTS" -eq 1 ] || fail "template PAYMENT_PROVIDER must default to none"

for key in PUBLIC_APP_URL PUBLIC_ORIGIN TURNSTILE_SITE_KEY PLATFORM_ADMIN_EMAILS PLATFORM_REGULATORY_REVIEWERS EVIDENCE_SCAN_API_URL; do
  count=$(grep -Ec "^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"REPLACE_WITH_${key}\"[[:space:]]*$" "$TEMPLATE" || true)
  [ "$count" -eq 1 ] || fail "template must contain exactly one ${key} placeholder"
done

awk \
  -v id="$D1_ID" \
  -v payment="$PAYMENT_MODE" \
  -v public_app="$PUBLIC_APP" \
  -v public_origin="$PUBLIC_ORIGIN_VALUE" \
  -v turnstile_site="$TURNSTILE_SITE" \
  -v platform_admins="$PLATFORM_ADMINS" \
  -v platform_reviewers="$PLATFORM_REVIEWERS" \
  -v scan_url="$SCAN_URL" '
  function emit(k,v){ print k " = \"" v "\""; replaced[k]++ }
  /^[[:space:]]*database_id[[:space:]]*=[[:space:]]*"REPLACE_WITH_D1_DATABASE_ID"[[:space:]]*$/ { print "database_id = \"" id "\""; id_replaced++; next }
  /^[[:space:]]*PAYMENT_PROVIDER[[:space:]]*=[[:space:]]*"none"[[:space:]]*$/ { print "PAYMENT_PROVIDER = \"" payment "\""; payment_replaced++; next }
  /^[[:space:]]*PUBLIC_APP_URL[[:space:]]*=/ { emit("PUBLIC_APP_URL",public_app); next }
  /^[[:space:]]*PUBLIC_ORIGIN[[:space:]]*=/ { emit("PUBLIC_ORIGIN",public_origin); next }
  /^[[:space:]]*TURNSTILE_SITE_KEY[[:space:]]*=/ { emit("TURNSTILE_SITE_KEY",turnstile_site); next }
  /^[[:space:]]*PLATFORM_ADMIN_EMAILS[[:space:]]*=/ { emit("PLATFORM_ADMIN_EMAILS",platform_admins); next }
  /^[[:space:]]*PLATFORM_REGULATORY_REVIEWERS[[:space:]]*=/ { emit("PLATFORM_REGULATORY_REVIEWERS",platform_reviewers); next }
  /^[[:space:]]*EVIDENCE_SCAN_API_URL[[:space:]]*=/ { emit("EVIDENCE_SCAN_API_URL",scan_url); next }
  { print }
  END {
    if (id_replaced != 1 || payment_replaced != 1) exit 42
    keys[1]="PUBLIC_APP_URL";keys[2]="PUBLIC_ORIGIN";keys[3]="TURNSTILE_SITE_KEY";keys[4]="PLATFORM_ADMIN_EMAILS";keys[5]="PLATFORM_REGULATORY_REVIEWERS";keys[6]="EVIDENCE_SCAN_API_URL"
    for(i=1;i<=6;i++)if(replaced[keys[i]]!=1)exit 43
  }
' "$TEMPLATE"
