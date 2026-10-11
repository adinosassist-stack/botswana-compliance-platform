import assert from "node:assert/strict";
import fs from "node:fs";

const helper=fs.readFileSync("cloudflare/src/owner-attention-entry.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const governance=fs.readFileSync("cloudflare/src/release-governance-entry.js","utf8");
const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");

assert.match(wrangler,/^main = "src\/release-governance-entry\.js"$/m);
assert.match(governance,/import base from "\.\/agentic-entry\.js"/);
assert.match(agentic,/import \{DAILY_BRIEF_PATH,ownerAttentionDailyBrief\} from "\.\/owner-attention-entry\.js"/);
assert.match(agentic,/request\.method==="GET"&&logicalPath===DAILY_BRIEF_PATH/);
assert.match(agentic,/ownerAttentionDailyBrief\(\{/);
assert.match(agentic,/const ownerEnv=withPlatformOwnerAdminEnv\(env\)/);
assert.match(agentic,/preparePlatformOwnerLogin\(request,ownerEnv\)/);
assert.match(agentic,/controlPlaneFetch:liveControlPlaneFetch/);

assert.match(helper,/buildOwnerAttentionProjection/);
assert.match(helper,/runtimeMarketProfile/);
assert.match(helper,/marketBusinessDate/);
assert.doesNotMatch(helper,/release-governance-entry/);
assert.doesNotMatch(helper,/export default/);
assert.match(helper,/DAILY_BRIEF_PATH="\/api\/daily-brief"/);
assert.match(helper,/RUNS_PATH="\/api\/agentic\/runs"/);
assert.match(helper,/OUTCOMES_PATH="\/api\/agentic\/outcomes"/);
assert.match(helper,/BUSINESS_CONTEXT_PATH="\/api\/business-context\/brief"/);
assert.match(helper,/shapeAvailability/);
assert.match(helper,/validDailyShape/);
assert.match(helper,/validRunsShape/);
assert.match(helper,/validOutcomesShape/);
assert.match(helper,/x-thebe-owner-attention-state/);
assert.match(helper,/x-thebe-owner-attention-version/);
assert.match(helper,/JSON\.stringify\(\{\.\.\.dailySource\.value,ownerAttention\}\)/);
assert.doesNotMatch(helper,/catch\s*\{[^}]*available:true/);

const {__ownerAttentionEntryTest:test}=await import("../cloudflare/src/owner-attention-entry.js");

assert.equal(test.validRunsShape({proposals:[]}),true);
assert.equal(test.validRunsShape({}),false);
assert.equal(test.validRunsShape({proposals:[{}]}),false);
assert.equal(test.validOutcomesShape({items:[]}),true);
assert.equal(test.validOutcomesShape({}),false);
assert.equal(test.validOutcomesShape({items:[{}]}),false);
assert.equal(test.validDailyShape({topActions:[],status:{openWork:0}}),true);
assert.equal(test.validDailyShape({topActions:[],status:{}}),false);

const invalidRuns=test.shapeAvailability({available:true,value:{},reason:null},test.validRunsShape);
assert.equal(invalidRuns.available,false);
assert.equal(invalidRuns.reason,"invalid_shape");

const counts=test.authoritativeCounts(
  {counts:{action:9,approvals:9,outcomes:9,total:27}},
  {status:{openWork:4,urgent:1,overdue:2}},
  [],
  [],
  {dailyAvailable:true,approvalsAvailable:false,outcomesAvailable:false}
);
assert.equal(counts.action,4);
assert.equal(counts.approvals,null);
assert.equal(counts.outcomes,null);
assert.equal(counts.total,null);
assert.equal(counts.urgent,1);
assert.equal(counts.overdue,2);

const enriched=test.enrichDailyActions({
  topActions:[
    {title:"missing stable id"},
    {id:"stable",source:"work",sourceRefs:[]}
  ]
});
assert.equal(enriched.topActions.length,1);
assert.equal(enriched.topActions[0].sourceId,"stable");
assert.equal(enriched.topActions[0].sourceRefs.includes("work:stable"),true);

const approvals=test.approvalRows({proposals:[{id:"p1",status:"pending",title:"Review me"}]});
assert.equal(approvals.length,1);
assert.equal(approvals[0].sourceId,"p1");
assert.equal(approvals[0].sourceRefs.includes("agentic_proposal:p1"),true);

const pending=test.pendingOutcomeRows(
  {proposals:[{id:"p1",status:"approved"},{id:"p2",status:"rejected"}]},
  {items:[{proposal_id:"p1"}]}
);
assert.deepEqual(pending.map(item=>item.sourceId),["p2"]);

console.log("owner-attention production entry contract: PASS");
