import assert from "node:assert/strict";
import fs from "node:fs";
const api=fs.readFileSync("cloudflare/src/agentic-responsibility-api.js","utf8");
const ui=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const css=fs.readFileSync("public/assets/owner-command-centre.css","utf8");

assert.match(api,/ROW_NUMBER\(\) OVER \(PARTITION BY responsibility_id ORDER BY created_at DESC,id DESC\)/);
assert.match(api,/FROM agent_responsibility_events\s+WHERE tenant_id=\?/);
assert.match(api,/activity_rank<=3/);
assert.match(api,/ORDER BY created_at DESC LIMIT 300/);
assert.match(api,/const recentByResponsibility=new Map\(\)/);
assert.match(api,/try\{detail=JSON\.parse\(event\.detail_json\|\|"\{\}"\)\}catch\{\}/);
assert.match(api,/recentEvents:recentByResponsibility\.get\(row\.id\)\|\|\[\]/);
assert.match(api,/toolScope:JSON\.parse\(row\.tool_scope_json\|\|"\[\]"\)/);
assert.doesNotMatch(api,/execution_allowed/);
assert.doesNotMatch(api,/jit_execution_permits|agent_execution_grants|agent_task_execution/i);
assert.doesNotMatch(api,/fetch\(|env\.[A-Z_]+\.fetch|queue\.send/i);

assert.match(ui,/const RELEASE="20261005-v28(?:8|9)"/);
assert.match(ui,/item\?\.recentEvents/);
assert.match(ui,/slice\(0,3\)/);
assert.match(ui,/Recent activity/);
assert.match(ui,/owner-responsibility-activity-row/);
assert.doesNotMatch(ui,/executeResponsibility/);
assert.match(css,/owner-responsibility-activity/);
assert.match(css,/owner-responsibility-activity-row/);
console.log("v288 responsibility activity timeline: ok");
