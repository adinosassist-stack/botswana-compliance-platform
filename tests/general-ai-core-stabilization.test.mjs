import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const production=read("cloudflare/wrangler.toml");
const staging=read("cloudflare/wrangler.general-ai-staging.toml");
const lines=text=>text.split(/\r?\n/);

test("production General AI and research stay disabled until protected live qualification",()=>{
 for(const key of ["THEBE_GENERAL_AI_ENABLED","THEBE_GENERAL_AI_RESEARCH_ENABLED"]){
  assert.ok(lines(production).includes(key+' = "false"'),key);
 }
});
test("isolated General AI staging has no public routes or production data bindings",()=>{
 for(const key of ["THEBE_GENERAL_AI_ENABLED","THEBE_GENERAL_AI_RESEARCH_ENABLED","THEBE_LIVE_VOICE_ENABLED","THEBE_INTERNAL_AUTONOMY_ENABLED"]){
  assert.ok(lines(staging).includes(key+' = "false"'),key);
 }
 assert.ok(lines(staging).includes("workers_dev = false"));
 assert.ok(lines(staging).includes("preview_urls = false"));
 assert.match(staging,/^database_name = "bw-general-ai-auth-staging"$/m);
 assert.match(staging,/^namespace_id = "78212078"$/m);
 assert.doesNotMatch(staging,/^\s*(?:routes?\s*=|zone_id\s*=|custom_domain\s*=|\[\[routes\]\]|\[assets\]|\[triggers\])/m);
 assert.doesNotMatch(staging,/8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce|bw-compliance-os\b/);
});
test("private staging cannot silently enable paid model or autonomous execution",()=>{
 for(const line of ['AI_FEATURES_DEFAULT = "off"','PAYMENT_PROVIDER = "none"','AGENT_BOUNDED_TASK_EXECUTION_ENABLED = "0"','THEBE_GPT_LIVE_PREVIEW_ENABLED = "false"']){
  assert.ok(lines(staging).includes(line),line);
 }
});
