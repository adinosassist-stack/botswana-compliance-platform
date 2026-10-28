import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const schema=fs.readFileSync("cloudflare/schema.sql","utf8"),migration=fs.readFileSync("cloudflare/migrations/070_payment_pop_documents.sql","utf8");
test("fresh schema and migration contain POP metadata with no settlement effects",()=>{
 for(const sql of [schema,migration]){
  assert.match(sql,/CREATE TABLE IF NOT EXISTS payment_pop_documents/);
  assert.match(sql,/scan_status TEXT NOT NULL DEFAULT 'pending'/);
 }
 assert.doesNotMatch(migration,/UPDATE\s+payment_orders|INSERT\s+INTO\s+payment_fulfillments|UPDATE\s+subscriptions/i);
});
test("release metadata and deployment instructions point to migration 071",()=>{
 const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
 assert.equal(profile.latest_cloudflare_migration,"071_payment_pop_runtime_compat.sql");
 assert.match(fs.readFileSync("cloudflare/src/agentic-entry.js","utf8"),/V81_SCHEMA_DELTA="070_payment_pop_documents.sql"/);
 assert.match(fs.readFileSync("docs/LAUNCH.md","utf8"),/through `071_payment_pop_runtime_compat.sql`/);
 assert.match(fs.readFileSync("cloudflare/README.md","utf8"),/migrations\/070_payment_pop_documents.sql/);
});
