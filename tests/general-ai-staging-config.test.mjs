import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const config=readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
const smoke=readFileSync(new URL("../scripts/general-ai-staging-preflight.mjs",import.meta.url),"utf8");
test("production profile explicitly disables general AI and research",()=>{
  assert.match(config,/THEBE_GENERAL_AI_ENABLED\s*=\s*"false"/);
  assert.match(config,/THEBE_GENERAL_AI_RESEARCH_ENABLED\s*=\s*"false"/);
});
test("staging smoke test requires opt-in and excludes production origin",()=>{
  assert.match(smoke,/I_ACKNOWLEDGE_PROVIDER_COSTS/);
  assert.match(smoke,/dedicated_staging_origin_required/);
  assert.match(smoke,/staging_auth_required/);
  assert.match(smoke,/researchPerformed/);
});
