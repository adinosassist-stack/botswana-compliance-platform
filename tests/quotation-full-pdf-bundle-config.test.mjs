import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("separate full Worker manifest uses only isolated resources and no public access",()=>{
 const m=read("../deploy/quotation-full-private-staging/wrangler.jsonc");
 assert.match(m,/quotation-full-pdf-worker-entry\.mjs/);
 assert.match(m,/"workers_dev": false/);
 assert.match(m,/"preview_urls": false/);
 assert.match(m,/"routes": \[\]/);
 assert.match(m,/bw-quotation-auth-synthetic-staging/);
 assert.match(m,/bw-quotation-staging/);
 assert.match(m,/bw-quotation-logo-private-staging/);
 assert.match(m,/bw-quotation-template-private-staging/);
 assert.doesNotMatch(m,/bw-compliance-os/);
 const current=read("../deploy/quotation-private-staging/wrangler.jsonc");
 assert.match(current,/quotation-service-bound-staging-worker\.mjs/);
});
test("full build entry injects pinned PDF engine rather than trusting env for a function",()=>{
 const s=read("../server/quotation-full-pdf-worker-entry.mjs");
 assert.match(s,/from "pdf-lib"/);
 assert.match(s,/QUOTATION_PRIVATE_PDF_ENGINE:Object\.freeze\(\{PDFDocument\}\)/);
 assert.doesNotMatch(s,/\.\.\.request\.headers/);
});
