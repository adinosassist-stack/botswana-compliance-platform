import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sh=readFileSync(new URL("../scripts/regulatory-staging-oauth-bootstrap.sh",import.meta.url),"utf8");

test("Codespaces staging OAuth script defaults read-only and pins the target",()=>{
  assert.match(sh,/set -euo pipefail/);
  assert.match(sh,/mode="\$\{1:-\}"/);
  assert.match(sh,/readonly DB_NAME="bw-compliance-os-regulatory-staging"/);
  assert.match(sh,/readonly DB_ID="20c0d37e-552e-438f-a56d-3f12c27d38e2"/);
  assert.match(sh,/readonly PRODUCTION_ID="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"/);
  assert.match(sh,/readonly BASELINE_COMMIT="8f59788351662c5cbb22bc0da01ba104d2142b31"/);
  assert.match(sh,/readonly BASELINE_BLOB="3657460d3f20d42d49aa2f5f6a2da6ef3f61588c"/);
  assert.match(sh,/\[\[ "\$DB_ID" != "\$PRODUCTION_ID"/);
  assert.match(sh,/d1 list --config "\$config" --json/);
  assert.match(sh,/INVENTORY_SQL="SELECT COUNT\(\*\) AS object_count FROM sqlite_schema/);
});

test("Only independently confirmed apply mode writes staging schema",()=>{
  assert.match(sh,/\[\[ "\$mode" != '--apply' \]\]/);
  assert.match(sh,/PREFLIGHT SUCCESS\. No database changes were made\./);
  assert.match(sh,/read -r -p 'Type INITIALIZE_EMPTY_STAGING to authorize: ' confirmation/);
  assert.match(sh,/\[\[ "\$confirmation" == 'INITIALIZE_EMPTY_STAGING' \]\]/);
  assert.match(sh,/\[\[ "\$\(get_count "\$INVENTORY_SQL" object_count\)" == '0' \]\]/);
  assert.match(sh,/git hash-object "\$schema"/);
  assert.match(sh,/wrangler d1 execute STAGING_DB --config "\$config" --remote --file "\$schema" --yes/);
  assert.doesNotMatch(sh,/wrangler (deploy|publish|d1 delete)/);
  assert.doesNotMatch(sh,/\b(DROP TABLE|DELETE FROM|UPDATE regulatory_rules)\b/i);
  assert.match(sh,/may have partially applied/);
  assert.match(sh,/SELECT COUNT\(\*\) AS row_count FROM \$table/);
});

test("OAuth mode ignores inherited API tokens",()=>{
  assert.match(sh,/unset CLOUDFLARE_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL CF_API_TOKEN CF_API_KEY/);
  assert.match(sh,/wrangler login --device --browser=false/);
  assert.doesNotMatch(sh,/echo [^\n]*CLOUDFLARE_API_TOKEN/);
});
