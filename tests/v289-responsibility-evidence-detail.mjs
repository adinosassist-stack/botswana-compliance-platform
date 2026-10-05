import assert from "node:assert/strict";
import fs from "node:fs";
const api=fs.readFileSync("cloudflare/src/agentic-responsibility-api.js","utf8");
const ui=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const css=fs.readFileSync("public/assets/owner-command-centre.css","utf8");

assert.match(api,/SELECT responsibility_id,event_type,actor_type,detail_json,evidence_hash,created_at FROM/);
assert.match(api,/WHERE tenant_id=\?/);
assert.match(api,/activity_rank<=3/);
assert.match(api,/ORDER BY created_at DESC LIMIT 300/);
assert.match(api,/evidenceHash:clean\(event\.evidence_hash,80\)\|\|null/);
assert.doesNotMatch(api,/execution_allowed/);
assert.doesNotMatch(api,/jit_execution_permits|agent_execution_grants|agent_task_execution/i);
assert.doesNotMatch(api,/fetch\(|env\.[A-Z_]+\.fetch|queue\.send/i);

assert.match(ui,/const RELEASE="20261005-v289"/);
assert.match(ui,/Evidence details/);
assert.match(ui,/toggleResponsibilityEvidenceDetail/);
assert.match(ui,/item\?\.recentEvents\)\?item\.recentEvents\.slice\(0,3\):\[\]/);
assert.match(ui,/event\?\.actorType/);
assert.match(ui,/event\?\.actionKey/);
assert.match(ui,/event\?\.evidenceHash/);
assert.match(ui,/Read-only evidence\. Viewing this record grants no execution authority\./);
assert.doesNotMatch(ui,/executeResponsibility/);
assert.match(css,/owner-responsibility-evidence-detail/);
assert.match(css,/owner-responsibility-evidence-detail-row/);
console.log("v289 responsibility evidence detail: ok");
