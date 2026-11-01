import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const cfg=readFileSync(new URL("../cloudflare/wrangler.general-ai-staging.toml",import.meta.url),"utf8");
const entry=readFileSync(new URL("../cloudflare/src/release-governance-entry.js",import.meta.url),"utf8");
const isolated=readFileSync(new URL("../cloudflare/src/general-ai-staging-entry.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../cloudflare/src/agentic-entry.js",import.meta.url),"utf8");
test("General AI staging stays private, disabled, and tenant-isolated",()=>{
  for(const expected of [
    'workers_dev = false','preview_urls = false',
    'THEBE_GENERAL_AI_ENABLED = "false"',
    'THEBE_GENERAL_AI_RESEARCH_ENABLED = "false"',
    'database_id = "ff229eef-7724-49ae-9d68-d3a1db669b63"',
    'namespace_id = "78212078"',
    'PAYMENT_PROVIDER = "none"','REGISTRATION_MODE = "hold"'
  ])assert.ok(cfg.includes(expected),expected);
  assert.doesNotMatch(cfg,/^\s*(?:route|routes|zone_id)\s*=/m);
  assert.doesNotMatch(cfg,/^\s*\[\[r2_buckets\]\]/m);
});
test("full release entrypoint must not be mistaken for qualified isolated General AI app",()=>{
  assert.match(entry,/import base from "\.\/agentic-entry\.js"/);
  assert.match(app,/import base from "\.\/production-entry\.js"/);
  // The dedicated staging bundle must not import the full application entrypoints.
  assert.match(cfg,/^main = "src\/general-ai-staging-entry\.js"$/m);
  assert.doesNotMatch(isolated,/(?:release-governance|agentic|production)-entry\.js/);
  assert.match(isolated,/handleGeneralAiRoute/);
});
