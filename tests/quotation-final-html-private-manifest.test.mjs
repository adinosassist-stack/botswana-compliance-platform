import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import worker from "../server/quotation-final-html-private-worker-entry.mjs";
test("review-only private Browser Run staging manifest has no public paths",()=>{
 const s=readFileSync("deploy/quotation-final-html-private/wrangler.jsonc","utf8");
 assert.match(s,/"browser": \{"binding": "QUOTATION_BROWSER"\}/);
 assert.match(s,/"compatibility_flags": \["nodejs_compat"\]/);
 assert.match(s,/"workers_dev": false/);
 assert.match(s,/"preview_urls": false/);
 assert.match(s,/"routes": \[\]/);
 assert.doesNotMatch(s,/"zone_name"|"route":|"services":|production/i);
 assert.doesNotMatch(s,/Candidate B PDF renderer is enabled/i);
});
test("accidentally invoked Worker default fetch always returns 404",async()=>{
 const out=await worker.fetch(new Request("https://quotation-preview.test/api/quotation/final-html/pdf-preview",{method:"POST"}));
 assert.equal(out.status,404);
 assert.equal(out.headers.get("cache-control"),"private, no-store");
});
