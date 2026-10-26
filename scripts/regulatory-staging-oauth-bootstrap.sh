#!/usr/bin/env bash
# Thebe Desk: account-scoped OAuth-only staging D1 bootstrap.
# Default read-only; --apply needs independent review and typed confirmation.
set -euo pipefail
mode="${1:-}"
[[ $# -le 1 && ( -z "$mode" || "$mode" == "--apply" ) ]] || { echo 'Usage: bash scripts/regulatory-staging-oauth-bootstrap.sh [--apply]' >&2; exit 2; }

readonly DB_NAME="bw-compliance-os-regulatory-staging"
readonly DB_ID="20c0d37e-552e-438f-a56d-3f12c27d38e2"
readonly ACCOUNT_ID="ddd23cab31928a4bb3d4998df9b26d1d"
readonly PRODUCTION_ID="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"
readonly BASELINE_COMMIT="8f59788351662c5cbb22bc0da01ba104d2142b31"
readonly BASELINE_BLOB="3657460d3f20d42d49aa2f5f6a2da6ef3f61588c"
readonly INVENTORY_SQL="SELECT COUNT(*) AS object_count FROM sqlite_schema WHERE substr(name,1,7) != 'sqlite_' AND name != '_cf_KV'"
[[ "$DB_ID" != "$PRODUCTION_ID" && "$DB_NAME" != "bw-compliance-os" ]] || { echo 'Production exclusion failed.' >&2; exit 1; }

for bin in node npm npx git curl; do command -v "$bin" >/dev/null || { echo "Missing required executable: $bin" >&2; exit 1; }; done
(( $(node -p "Number(process.versions.node.split('.')[0])") >= 22 )) || { echo 'Node 22+ required (nvm install 22 && nvm use 22).' >&2; exit 1; }
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL CF_API_TOKEN CF_API_KEY
export WRANGLER_SEND_METRICS=false

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
config="$tmp/staging-wrangler.json"
schema="$tmp/schema.sql"
printf '{"name":"thebe-staging-oauth-operator","account_id":"%s","compatibility_date":"2026-09-03","d1_databases":[{"binding":"STAGING_DB","database_id":"%s","database_name":"%s"}]}' "$ACCOUNT_ID" "$DB_ID" "$DB_NAME" > "$config"
wrangler() { npx --yes wrangler@4.135.0 "$@"; }

if ! wrangler whoami > "$tmp/whoami.log" 2>&1; then
  echo 'Authorize your existing Cloudflare account with the device code:'
  wrangler login --device --browser=false
fi

echo 'Checking exact staging DB UUID/name in the authenticated account...'
wrangler d1 list --config "$config" --json > "$tmp/list.json"
node - "$tmp/list.json" "$DB_ID" "$DB_NAME" "$PRODUCTION_ID" <<'NODE'
const fs=require('node:fs');
const [p,id,name,prod]=process.argv.slice(2), list=JSON.parse(fs.readFileSync(p,'utf8'));
if(!Array.isArray(list)||id===prod||list.filter(x=>x?.uuid===id&&x?.name===name).length!==1||
  list.some(x=>x?.name===name&&x?.uuid!==id)){
  console.error('REFUSED: exact staging D1 name and UUID were not verified'); process.exit(1);
}
NODE

get_count() {
  local sql="$1" key="$2"
  wrangler d1 execute STAGING_DB --config "$config" --remote --command "$sql" --json > "$tmp/result.json"
  node - "$tmp/result.json" "$key" <<'NODE'
const fs=require('node:fs');
const [p,key]=process.argv.slice(2), a=JSON.parse(fs.readFileSync(p,'utf8'));
if(!Array.isArray(a)||a.length!==1||a[0]?.success!==true||!Array.isArray(a[0].results)||
a[0].results.length!==1||!Number.isSafeInteger(a[0].results[0]?.[key])||a[0].results[0][key]<0){
console.error('REFUSED: invalid D1 query result');process.exit(1);
}
console.log(a[0].results[0][key]);
NODE
}

before="$(get_count "$INVENTORY_SQL" object_count)"
echo "Verified $DB_NAME / $DB_ID. Application schema objects: $before"
[[ "$before" == '0' ]] || { echo 'REFUSED: staging not empty; do not import over existing or partial schema.' >&2; exit 1; }

curl -fsSL --proto '=https' --tlsv1.2 --max-time 60 "https://raw.githubusercontent.com/adinosassist-stack/botswana-compliance-platform/$BASELINE_COMMIT/cloudflare/schema.sql" -o "$schema"
[[ "$(git hash-object "$schema")" == "$BASELINE_BLOB" ]] || { echo 'REFUSED: reviewed SQL Git blob hash mismatch.' >&2; exit 1; }
echo 'Reviewed baseline integrity: VERIFIED.'
if [[ "$mode" != '--apply' ]]; then
  echo 'PREFLIGHT SUCCESS. No database changes were made.'
  echo 'After independent authorization, rerun with --apply.'
  exit 0
fi

echo 'Staging-only write outside the GitHub protected environment; independent approval is required.'
echo 'Ensure no concurrent staging database writer is active.'
read -r -p 'Type INITIALIZE_EMPTY_STAGING to authorize: ' confirmation
[[ "$confirmation" == 'INITIALIZE_EMPTY_STAGING' ]] || { echo 'REFUSED: staging write not confirmed.' >&2; exit 1; }
[[ "$(get_count "$INVENTORY_SQL" object_count)" == '0' ]] || { echo 'REFUSED: staging changed after preflight.' >&2; exit 1; }
if ! wrangler d1 execute STAGING_DB --config "$config" --remote --file "$schema" --yes > "$tmp/import.log" 2>&1; then
  echo 'Import error: may have partially applied. Inspect staging before retrying. Provider output withheld.' >&2
  exit 1
fi

after="$(get_count "$INVENTORY_SQL" object_count)"
[[ "$after" != '0' ]] || { echo 'Post-import schema verification failed.' >&2; exit 1; }
for table in tenants users regulatory_sources regulatory_rules compliance_obligations; do
  [[ "$(get_count "SELECT COUNT(*) AS row_count FROM $table" row_count)" == '0' ]] || { echo "Unexpected rows in $table" >&2; exit 1; }
done
echo "STAGING BASELINE INITIALIZED: $after application schema objects. Checked data tables empty."
echo 'Regulatory rule import, production activation, and v1.8 qualifications remain separate.'
