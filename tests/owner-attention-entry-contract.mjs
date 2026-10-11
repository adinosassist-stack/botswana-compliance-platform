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
assert.doesNotMatch(agentic,/liveControlPlaneFetch/);

assert.match(helper,/buildOwnerAttentionProjection/);
assert.match(helper,/runtimeMarketProfile/);
assert.match(helper,/marketBusinessDate/);
assert.doesNotMatch(helper,/release-governance-entry/);
assert.doesNotMatch(helper,/export default/);
assert.doesNotMatch(helper,/controlPlaneFetch/);
assert.match(helper,/DAILY_BRIEF_PATH="\/api\/daily-brief"/);
assert.match(helper,/RUNS_PATH="\/api\/agentic\/runs"/);
assert.match(helper,/OUTCOMES_PATH="\/api\/agentic\/outcomes"/);
assert.match(helper,/BUSINESS_CONTEXT_PATH="\/api\/business-context\/brief"/);
assert.match(helper,/fetchJsonSource\(coreFetch,runsRequest,env,ctx,"agentic_runs_fetch_failed"\)/);
assert.match(helper,/fetchJsonSource\(coreFetch,outcomesRequest,env,ctx,"agentic_outcomes_fetch_failed"\)/);
assert.match(helper,/fetchJsonSource\(coreFetch,businessRequest,env,ctx,"business_context_fetch_failed"\)/);
assert.match(helper,/daily_brief_fetch_failed/);
assert.match(helper,/not_read_due_to_daily_brief_failure/);
assert.match(helper,/unavailableProjection/);
assert.match(helper,/dailyResponse\.status===401\|\|dailyResponse\.status===403/);
assert.match(helper,/dailyResponse\.status>=500/);
assert.match(helper,/shapeAvailability/);
assert.match(helper,/validDailyShape/);
assert.match(helper,/validRunsShape/);
assert.match(helper,/validOutcomesShape/);
assert.match(helper,/knownCount\(value\?\.status\?\.urgent\)!==null/);
assert.match(helper,/knownCount\(value\?\.status\?\.overdue\)!==null/);
assert.match(helper,/x-thebe-owner-attention-state/);
assert.match(helper,/x-thebe-owner-attention-version/);
assert.match(helper,/dailyBrief:availability\(dailySource\.available,dailySource\.reason,true\)/);
assert.match(helper,/proposalSeverity\(item\).*item\?\.risk/);
assert.match(helper,/item\?\.decision_at/);
assert.doesNotMatch(helper,/catch\s*\{[^}]*available:true/);

const {__ownerAttentionEntryTest:test,ownerAttentionDailyBrief}=await import("../cloudflare/src/owner-attention-entry.js");

assert.equal(test.validRunsShape({proposals:[]}),true);
assert.equal(test.validRunsShape({}),false);
assert.equal(test.validRunsShape({proposals:[{}]}),false);
assert.equal(test.validRunsShape({proposals:[{id:"p1"}]}),false,'proposal status is required for authoritative approval/outcome state');
assert.equal(test.validOutcomesShape({items:[]}),true);
assert.equal(test.validOutcomesShape({}),false);
assert.equal(test.validOutcomesShape({items:[{}]}),false);
assert.equal(test.validDailyShape({topActions:[],status:{openWork:0,urgent:0,overdue:0}}),true);
assert.equal(test.validDailyShape({topActions:[],status:{openWork:0}}),false,'ready Daily Brief must expose urgent and overdue counts as well as open work');
assert.equal(test.validDailyShape({topActions:[],status:{openWork:0,urgent:0}}),false);

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

const approvals=test.approvalRows({proposals:[{id:"p1",status:"pending",title:"Review me",risk:"high",decision_at:"2026-10-11T07:00:00Z"}]});
assert.equal(approvals.length,1);
assert.equal(approvals[0].sourceId,"p1");
assert.equal(approvals[0].severity,"high");
assert.equal(approvals[0].updatedAt,"2026-10-11T07:00:00Z");
assert.equal(approvals[0].sourceRefs.includes("agentic_proposal:p1"),true);

const pending=test.pendingOutcomeRows(
  {proposals:[{id:"p1",status:"approved"},{id:"p2",status:"rejected"}]},
  {items:[{proposal_id:"p1"}]}
);
assert.deepEqual(pending.map(item=>item.sourceId),["p2"]);

function jsonResponse(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8"}});
}

const baseRequest=new Request("https://thebedesk.example/api/daily-brief",{headers:{cookie:"bw_session=test"}});
const observedPaths=[];
const healthyCoreFetch=async request=>{
  const path=new URL(request.url).pathname;
  observedPaths.push(path);
  if(path==="/api/daily-brief")return jsonResponse({
    date:"2026-10-11",
    generatedAt:"2026-10-11T08:00:00Z",
    status:{openWork:2,urgent:1,overdue:0},
    topActions:[{source:"hr",id:"h1",title:"Review HR case",priority:1,status:"open"}]
  });
  if(path==="/api/agentic/runs")return jsonResponse({proposals:[
    {id:"p1",status:"pending",title:"Approve reminder",risk:"medium",sourceRefs:["run:r1"]},
    {id:"p2",status:"approved",title:"Approved proposal",risk:"low",decision_at:"2026-10-11T07:30:00Z"}
  ]});
  if(path==="/api/agentic/outcomes")return jsonResponse({items:[{proposal_id:"p2"}]});
  if(path==="/api/business-context/brief")return jsonResponse({brief:{observedAt:"2026-10-11T08:00:00Z",priorities:[{key:"r1",title:"Advisory recommendation"}]}});
  return jsonResponse({error:"unexpected_path"},404);
};

const healthyResponse=await ownerAttentionDailyBrief({request:baseRequest,env:{},ctx:{},coreFetch:healthyCoreFetch});
assert.equal(healthyResponse.status,200);
assert.equal(healthyResponse.headers.get("x-thebe-owner-attention-state"),"ready");
const healthyBody=await healthyResponse.json();
assert.equal(healthyBody.ownerAttention.state,"ready");
assert.equal(healthyBody.ownerAttention.counts.action,2,"authoritative action count must use Daily Brief openWork, not the sliced topActions length");
assert.equal(healthyBody.ownerAttention.counts.approvals,1);
assert.equal(healthyBody.ownerAttention.counts.outcomes,0);
assert.equal(healthyBody.ownerAttention.counts.total,3);
assert.equal(healthyBody.ownerAttention.counts.urgent,1);
assert.equal(healthyBody.ownerAttention.counts.overdue,0);
assert.deepEqual(new Set(observedPaths),new Set(["/api/daily-brief","/api/agentic/runs","/api/agentic/outcomes","/api/business-context/brief"]));
const authoritativeItems=healthyBody.ownerAttention.items.filter(item=>item.authoritative===true);
assert.ok(authoritativeItems.length>=2);
assert.equal(authoritativeItems.every(item=>Array.isArray(item.sourceRefs)&&item.sourceRefs.length>0),true,"every authoritative canonical item must retain at least one canonical source reference");
const recommendation=healthyBody.ownerAttention.items.find(item=>item.category==="recommendation");
assert.equal(recommendation?.authoritative,false,"source-less recommendations may exist only when explicitly non-authoritative");

const malformedDailyFetch=async request=>{
  const path=new URL(request.url).pathname;
  if(path==="/api/daily-brief")return jsonResponse({status:{openWork:0},topActions:[]});
  if(path==="/api/agentic/runs")return jsonResponse({proposals:[]});
  if(path==="/api/agentic/outcomes")return jsonResponse({items:[]});
  if(path==="/api/business-context/brief")return jsonResponse({brief:{priorities:[]}});
  return jsonResponse({error:"unexpected_path"},404);
};
const malformedResponse=await ownerAttentionDailyBrief({request:baseRequest,env:{},ctx:{},coreFetch:malformedDailyFetch});
const malformedBody=await malformedResponse.json();
assert.equal(malformedBody.ownerAttention.state,"unavailable");
assert.equal(malformedBody.ownerAttention.counts.action,null);
assert.equal(malformedBody.ownerAttention.counts.total,null);
assert.equal(malformedBody.ownerAttention.sourceAvailability.dailyBrief.available,false);
assert.equal(malformedBody.ownerAttention.sourceAvailability.dailyBrief.reason,"invalid_shape");

const throwingRunsFetch=async request=>{
  const path=new URL(request.url).pathname;
  if(path==="/api/daily-brief")return jsonResponse({date:"2026-10-11",status:{openWork:1,urgent:0,overdue:0},topActions:[{source:"hr",id:"h1",title:"One action"}]});
  if(path==="/api/agentic/runs")throw new Error("sensitive database detail must not leak");
  if(path==="/api/agentic/outcomes")return jsonResponse({items:[]});
  if(path==="/api/business-context/brief")return jsonResponse({brief:{priorities:[]}});
  return jsonResponse({error:"unexpected_path"},404);
};
const throwingRunsResponse=await ownerAttentionDailyBrief({request:baseRequest,env:{},ctx:{},coreFetch:throwingRunsFetch});
assert.equal(throwingRunsResponse.status,200,"a secondary-source failure must not erase the authenticated Daily Brief response");
const throwingRunsBody=await throwingRunsResponse.json();
assert.equal(throwingRunsBody.ownerAttention.state,"unavailable");
assert.equal(throwingRunsBody.ownerAttention.counts.action,1);
assert.equal(throwingRunsBody.ownerAttention.counts.approvals,null);
assert.equal(throwingRunsBody.ownerAttention.counts.outcomes,null);
assert.equal(throwingRunsBody.ownerAttention.counts.total,null);
assert.equal(throwingRunsBody.ownerAttention.sourceAvailability.approvals.available,false);
assert.equal(throwingRunsBody.ownerAttention.sourceAvailability.approvals.reason,"agentic_runs_fetch_failed");
assert.doesNotMatch(JSON.stringify(throwingRunsBody),/sensitive database detail/,'internal exception messages must not leak into canonical API state');

const dailyExceptionResponse=await ownerAttentionDailyBrief({
  request:baseRequest,
  env:{},ctx:{},
  coreFetch:async()=>{throw new Error("secret daily database detail")}
});
assert.equal(dailyExceptionResponse.status,503);
assert.equal(dailyExceptionResponse.headers.get("x-thebe-owner-attention-state"),"unavailable");
const dailyExceptionBody=await dailyExceptionResponse.json();
assert.equal(dailyExceptionBody.ownerAttention.state,"unavailable");
assert.equal(dailyExceptionBody.ownerAttention.counts.total,null);
assert.equal(dailyExceptionBody.ownerAttention.sourceAvailability.dailyBrief.reason,"daily_brief_fetch_failed");
assert.equal(dailyExceptionBody.ownerAttention.sourceAvailability.approvals.reason,"not_read_due_to_daily_brief_failure");
assert.doesNotMatch(JSON.stringify(dailyExceptionBody),/secret daily database detail/,'primary-source exceptions must expose stable codes rather than internals');

const authFailure=await ownerAttentionDailyBrief({
  request:baseRequest,
  env:{},ctx:{},
  coreFetch:async()=>jsonResponse({error:"unauthenticated"},401)
});
assert.equal(authFailure.status,401,"authentication failures must pass through without synthesizing business data");
const authFailureBody=await authFailure.json();
assert.equal(authFailureBody.ownerAttention,undefined);

console.log("owner-attention production entry contract: PASS");
