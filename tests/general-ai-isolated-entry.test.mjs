import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/src/general-ai-staging-entry.js";
import {readFileSync} from "node:fs";
const config=readFileSync(new URL("../cloudflare/wrangler.general-ai-staging.toml",import.meta.url),"utf8");
const request=(path,method="POST",headers={})=>new Request("https://ai-staging.thebedesk.com"+path,{method,headers});
test("staging entrypoint has no unrelated public surface",async()=>{
  const result=await worker.fetch(request("/api/auth/register"),{APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"true"});
  assert.equal(result.status,404);
});
test("staging AI stays off even with valid-looking request",async()=>{
  const response=await worker.fetch(request("/api/ai/general"),{APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false"});
  assert.equal(response.status,404);
});
test("missing auth fails closed when feature enabled for controlled tests",async()=>{
  const response=await worker.fetch(request("/api/ai/general"),{APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"true"});
  assert.equal(response.status,401);
});
test("production environment never serves staging entrypoint",async()=>{
  const response=await worker.fetch(request("/api/ai/general"),{APP_ENV:"production",THEBE_GENERAL_AI_ENABLED:"true"});
  assert.equal(response.status,404);
});
test("staging configuration isolates entrypoint with feature flags off",()=>{
  assert.match(config,/main = "src\/general-ai-staging-entry\.js"/);
  assert.match(config,/THEBE_GENERAL_AI_ENABLED = "false"/);
  assert.match(config,/workers_dev = false/);
  assert.match(config,/preview_urls = false/);
});
