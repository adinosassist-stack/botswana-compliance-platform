import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../.github/workflows/quotation-approved-binary-export.yml",import.meta.url),"utf8");
test("exact reviewed source and main-only manual execution",()=>{
 assert.match(s,/ref: e5a06c40ebcbe8c2545bc6f5f4ce18a936dad786/);
 assert.match(s,/github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/);
 assert.match(s,/persist-credentials: false/);
 assert.match(s,/permissions:\n  contents: read/);
});
test("both binary identities verified before any retained payload",()=>{
 assert.match(s,/c1f650bf14454c5257dd827a9ef6857a2f15ece6e3918542d472b4929916340c/);
 assert.match(s,/865a5a94eef52e1e52237668b7063feffcc53ae43f0aa772330e7552718d19a6/);
 assert.match(s,/sha256sum --check --status/g);
 assert.match(s,/deploy --dry-run/g);
 assert.match(s,/OFFLINE_EXPORT_ONLY/);
 assert.doesNotMatch(s,/CLOUDFLARE_API_TOKEN|wrangler versions upload|wrangler versions deploy|wrangler deploy --env/);
});
