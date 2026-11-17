import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("exact promoted npm lock matches independently qualified artifact",()=>{
 const path="deploy/quotation-final-html-private/";
 const app=JSON.parse(readFileSync(path+"package.json","utf8"));
 const lock=JSON.parse(readFileSync(path+"package-lock.json","utf8"));
 assert.equal(app.dependencies["@cloudflare/playwright"],"1.3.0");
 assert.equal(lock.packages[""].dependencies["@cloudflare/playwright"],"1.3.0");
 const artifact=lock.packages["node_modules/@cloudflare/playwright"];
 assert.equal(artifact.version,"1.3.0");
 assert.equal(artifact.integrity,
 "sha512-WOlpXzfJ7noXmW8qE/qlU7MbVHyt9IzxxwPcTGeh2+YQS1gqNIe3fl99AZvBsheH0o7oCePYtL9wRV1KPCYghQ==");
 assert.equal(artifact.resolved,
 "https://registry.npmjs.org/@cloudflare/playwright/-/playwright-1.3.0.tgz");
});
test("the only HTTP entry remains deny-all and Browser Run is private",()=>{
 const base="deploy/quotation-final-html-private/";
 const s=readFileSync(base+"worker.mjs","utf8");
 const m=readFileSync(base+"wrangler.jsonc","utf8");
 assert.match(s,/import \{chromium\} from "@cloudflare\/playwright"/);
 assert.match(s,/return new Response\("Not Found",\{status:404/);
 assert.match(s,/chromium\.launch\(binding\)/);
 assert.match(m,/"workers_dev": false/);
 assert.match(m,/"preview_urls": false/);
 assert.match(m,/"routes": \[\]/);
 assert.match(m,/"browser": \{"binding": "QUOTATION_BROWSER"\}/);
});
