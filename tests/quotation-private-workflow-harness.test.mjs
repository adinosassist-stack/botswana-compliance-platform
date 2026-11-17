import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../server/quotation-private-workflow-harness.mjs",import.meta.url),"utf8");
const manifest=readFileSync(new URL("../deploy/quotation-private-workflow-harness/wrangler.jsonc",import.meta.url),"utf8");
test("no public or preview endpoints configured",()=>{
 assert.match(manifest,/"workers_dev"\s*:\s*false/);
 assert.match(manifest,/"preview_urls"\s*:\s*false/);
 assert.match(manifest,/"routes"\s*:\s*\[\s*\]/);
 assert.match(source,/fetch\(\)\s*\{return new Response\("Not Found"/);
});
test("review-only harness starts disabled and rejects write rehearsals",()=>{
 assert.match(manifest,/"QUOTATION_HARNESS_ENABLED"\s*:\s*"disabled"/);
 assert.match(source,/params\?\.enableWrites===true/);
 assert.match(source,/anonymous-denial-only/);
});
test("separate service-only bindings; no direct D1 R2 or public URL",()=>{
 assert.match(manifest,/"binding":"QUOTATION_SERVICE"/);
 assert.match(manifest,/"binding":"QUOTATION_SYNTHETIC_CALLER"/);
 assert.doesNotMatch(manifest,/"d1_databases"|"r2_buckets"|"triggers"|"crons"/);
});
test("pinned original quotation and caller SHA-256",()=>{
 assert.match(source,/09eed552bc5ef79ff3ca6b5b57e56453c0a2326e330968d47dcab39937e93274/);
 assert.match(source,/c1f650bf14454c5257dd827a9ef6857a2f15ece6e3918542d472b4929916340c/);
});
