/**
 * Safety regression: quotation staging code must remain inert in both live
 * application entrypoints until separately authorized and reviewed.
 * This asserts repository source boundaries, NOT deployed Cloudflare status.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=relative=>readFileSync(new URL("../"+relative,import.meta.url),"utf8");
const liveEntrypoints=[
 "cloudflare/src/worker.js",
 "server/server.js",
 "public/index.html"
];
const forbidden=[
 "quotation-logo-pdf-node-staging",
 "quotation-logo-node-staging",
 "quotation-draft-pdf-http",
 "quotation-draft-form.mjs",
 "/api/quotation/draft/pdf-preview"
];
test("production Worker/Node/shell cannot register private draft preview by accident",()=>{
 for(const path of liveEntrypoints){
  const body=read(path);
  for(const pattern of forbidden)assert.ok(!body.includes(pattern),
   "quotation staging is unintentionally referenced by "+path+": "+pattern);
 }
});
test("quotation modules remain dedicated, not imported in production index paths",()=>{
 const p=read("server/quotation-logo-pdf-node-staging.mjs");
 assert.match(p,/createNodeStagingQuotationPdfPreviewHandler/);
 assert.match(p,/handleQuotationDraftPdfPreview/);
 const w=read("cloudflare/src/worker.js");
 assert.ok(!w.includes("quotation-logo-d1-r2-store.mjs"));
 assert.ok(!w.includes("quotation-staging-readonly-preflight"));
});
test("real acceptance runs only with pinned isolated PDF engine and protected no-deploy workflow",()=>{
 const workflow=read(".github/workflows/quotation-logo-real-pdf.yml");
 assert.match(workflow,/pdf-lib@1\.17\.1/);
 assert.match(workflow,/quotation-logo-real-private-e2e\.test\.mjs/);
 assert.doesNotMatch(workflow,/\b(?:wrangler deploy|wrangler d1 execute|npm run deploy)\b/);
 const inventory=read(".github/workflows/quotation-staging-inventory.yml");
 assert.match(inventory,/workflow_dispatch:/);
 assert.match(inventory,/if: github\.ref == 'refs\/heads\/main'/);
 assert.doesNotMatch(inventory,/\b(?:wrangler deploy|wrangler d1 execute|curl -X POST)\b/);
});
