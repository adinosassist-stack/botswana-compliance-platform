import assert from "node:assert/strict";
import fs from "node:fs";

const entry=fs.readFileSync("cloudflare/src/owner-attention-entry.js","utf8");
const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");

assert.match(wrangler,/^main = "src\/owner-attention-entry\.js"$/m);
assert.match(entry,/import base from "\.\/release-governance-entry\.js"/);
assert.match(entry,/buildOwnerAttentionProjection/);
assert.match(entry,/runtimeMarketProfile/);
assert.match(entry,/marketBusinessDate/);

assert.match(entry,/DAILY_BRIEF_PATH="\/api\/daily-brief"/);
assert.match(entry,/RUNS_PATH="\/api\/agentic\/runs"/);
assert.match(entry,/OUTCOMES_PATH="\/api\/agentic\/outcomes"/);
assert.match(entry,/BUSINESS_CONTEXT_PATH="\/api\/business-context\/brief"/);
assert.match(entry,/if\(request\.method==="GET"&&path===DAILY_BRIEF_PATH\)return ownerAttentionDailyBrief/);
assert.match(entry,/if\(!dailyResponse\.ok\)return dailyResponse/);

assert.match(entry,/dailyBrief:availability\(true,null,true\)/);
assert.match(entry,/businessContext:availability\(businessSource\.available,businessSource\.reason,false\)/);
assert.match(entry,/approvals:availability\(runsSource\.available,runsSource\.reason,true\)/);
assert.match(entry,/outcomes:availability\(outcomeSourceAvailable/);
assert.match(entry,/const outcomeSourceAvailable=runsSource\.available&&outcomesSource\.available/);

assert.match(entry,/proposalStatus\(item\)==="pending"/);
assert.match(entry,/proposalStatus\(item\)!=="pending"/);
assert.match(entry,/agentic_proposal:\$\{id\}/);
assert.match(entry,/measured\.has\(id\)/);
assert.match(entry,/sourceRefs:\[\.\.\.new Set/);

assert.match(entry,/knownCount\(daily\?\.status\?\.openWork\)/);
assert.match(entry,/approvalCount=approvalsAvailable\?approvals\.length:null/);
assert.match(entry,/outcomeCount=outcomesAvailable\?outcomes\.length:null/);
assert.match(entry,/every\(value=>value!==null\)\?action\+approvalCount\+outcomeCount:null/);
assert.doesNotMatch(entry,/catch\s*\{[^}]*available:true/);

assert.match(entry,/JSON\.stringify\(\{\.\.\.dailySource\.value,ownerAttention\}\)/);
assert.match(entry,/x-thebe-owner-attention-version/);
assert.match(entry,/async scheduled\(event,env,ctx\)\{return base\.scheduled\(event,env,ctx\)\}/);

console.log("owner-attention production entry contract: PASS");
