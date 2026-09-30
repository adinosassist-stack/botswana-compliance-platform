import fs from "node:fs";
import assert from "node:assert/strict";

const source=fs.readFileSync(new URL("../cloudflare/src/agentic-task-execution.js",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../cloudflare/migrations/064_v213_jit_execution_permits.sql",import.meta.url),"utf8");

assert.match(migration,/agent_jit_execution_permits/);
assert.match(migration,/agent_id TEXT NOT NULL CHECK\(agent_id='THEBE-001'\)/);
assert.match(migration,/action_key TEXT NOT NULL CHECK\(action_key='task\.create'\)/);
assert.match(migration,/max_uses INTEGER NOT NULL DEFAULT 1 CHECK\(max_uses=1\)/);
assert.match(migration,/use_count INTEGER NOT NULL DEFAULT 0 CHECK\(use_count BETWEEN 0 AND 1\)/);
assert.match(migration,/q\.status='approved'/);
assert.match(migration,/q\.approved_payload_hash=q\.payload_hash/);
assert.match(migration,/g\.status='active'/);

assert.match(source,/async function issueJitPermit/);
assert.match(source,/roleAllowed\(auth,"owner"\)/);
assert.match(source,/Date\.now\(\)\+5\*60\*1000/);
assert.match(source,/jit_permit_already_issued/);
assert.match(source,/jit_permit_required/);
assert.match(source,/jit_permit_invalid_or_expired/);
assert.match(source,/String\(permit\.human_user_id\)!==String\(auth\.user_id\)/);
assert.match(source,/String\(permit\.task_request_id\)!==String\(requestId\)/);
assert.match(source,/String\(permit\.execution_grant_id\)!==String\(row\.execution_grant_id\)/);
assert.match(source,/String\(permit\.payload_hash\)!==String\(row\.payload_hash\)/);
assert.match(source,/Number\(permit\.max_uses\)!==1/);
assert.match(source,/Number\(permit\.use_count\)!==0/);
assert.match(source,/new Date\(permit\.expires_at\)\.getTime\(\)<=Date\.now\(\)/);
assert.match(source,/status='active' AND max_uses=1 AND use_count=0 AND expires_at>CURRENT_TIMESTAMP/);
assert.match(source,/const permitChanged=Number\(results\?\.\[0\]/);
assert.match(source,/const changed=Number\(results\?\.\[1\]/);
assert.match(source,/permitChanged!==1\|\|changed!==1/);
assert.doesNotMatch(source.slice(source.indexOf("async function executeTask"),source.indexOf("async function listTasks")),/if\(replay\)return json/);
assert.match(source,/jit-permit\$\/\);/);

console.log("v213 JIT execution permit static adversarial gate passed");
