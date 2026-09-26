import assert from "node:assert/strict";import fs from "node:fs";
const schema=fs.readFileSync("cloudflare/schema.sql","utf8");
const loop=fs.readFileSync("cloudflare/src/finance-watch-durable-loop.js","utf8");
assert.match(schema,/CREATE TABLE IF NOT EXISTS audit_events\([\s\S]*id INTEGER PRIMARY KEY AUTOINCREMENT/,"audit IDs are database-owned integers");
assert.doesNotMatch(loop,/INSERT INTO audit_events\(id,/,"Finance Watch must not write UUIDs into integer audit IDs");
assert.match(loop,/INSERT INTO audit_events\(tenant_id,event_type,entity_type,entity_id,event_data\).*AGENT_FINANCE_OBSERVATION_VERIFIED/s);
assert.match(loop,/INSERT INTO audit_events\(tenant_id,event_type,entity_type,entity_id,event_data\).*AGENT_FINANCE_OBSERVATION_RECOVERED/s);
console.log("v149 Finance Watch audit schema contract passed");
