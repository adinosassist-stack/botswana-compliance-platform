import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const content=readFileSync(new URL("../cloudflare/wrangler.general-ai-staging.toml",import.meta.url),"utf8");
test("dedicated General AI staging proposal is isolated and disabled",()=>{
  assert.match(content,/name = "bw-general-ai-staging"/);
  assert.match(content,/APP_ENV = "staging"/);
  assert.match(content,/THEBE_GENERAL_AI_ENABLED = "false"/);
  assert.match(content,/THEBE_GENERAL_AI_RESEARCH_ENABLED = "false"/);
  assert.match(content,/workers_dev = false/);
  assert.match(content,/preview_urls = false/);
  assert.doesNotMatch(content,/^\s*\[\[routes\]\]/m);
  assert.match(content,/^\s*\[\[d1_databases\]\]/m);
  assert.match(content,/^database_name = "bw-general-ai-auth-staging"$/m);
  assert.match(content,/^database_id = "ff229eef-7724-49ae-9d68-d3a1db669b63"$/m);
  assert.doesNotMatch(content,/^\s*\[\[r2_buckets\]\]/m);
  assert.match(content,/^\s*\[\[ratelimits\]\]/m);
  assert.match(content,/^namespace_id = "78212078"$/m);
  assert.match(content,/^limit = 5$/m);
  assert.match(content,/^period = 60$/m);
  assert.doesNotMatch(content,/^\s*\[secrets\]/m);
});

test("staging cannot inherit production service bindings or routes",()=>{
 assert.doesNotMatch(content,/^\s*(?:routes|route|zone_id|account_id)\s*=/m);
 assert.doesNotMatch(content,/^\s*\[\[?(?:services|kv_namespaces|durable_objects|queues|vectorize|hyperdrive|unsafe)\b/m);
 assert.match(content,/^PUBLIC_ORIGIN = "https:\/\/ai-staging\.thebedesk\.com"$/m);
 assert.match(content,/^PAYMENT_PROVIDER = "none"$/m);
 assert.match(content,/^REGISTRATION_MODE = "hold"$/m);
});
