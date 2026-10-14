import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {AGENT_COST_TELEMETRY_EVENT} from "../cloudflare/src/agent-cost-outcome-telemetry.js";

// Use the actual DDL, not a permissive test double. This regression is expected
// to fail until telemetry storage is migrated to a compatible schema.
const migration=readFileSync(new URL("../cloudflare/migrations/045_v80_agentic_foundation.sql",import.meta.url),"utf8");
const ddl=migration.match(/CREATE TABLE IF NOT EXISTS agentic_events\([\s\S]*?\n\);/)?.[0];
assert.ok(ddl,"real agentic_events DDL must exist");
const db=new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=OFF;");
db.exec(ddl);
assert.throws(()=>db.prepare("INSERT INTO agentic_events(id,tenant_id,run_id,event_type,actor_user_id,detail_json) VALUES(?,?,?,?,?,?)").run("id-1","tenant-A","run-1",AGENT_COST_TELEMETRY_EVENT,"user-1","{}"),/CHECK constraint failed/);
console.log("Verified blocker: real migration 045 rejects shadow cost telemetry; activation must remain disabled.");
