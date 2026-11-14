import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessWorkspaceAgentNoRoutePlan } from "../scripts/workspace-agent-no-route-staging-plan.mjs";

const fixture=JSON.parse(readFileSync(new URL("../docs/workspace-agent-no-route-staging-plan.json",import.meta.url),"utf8"));
const assess=(changes={})=>assessWorkspaceAgentNoRoutePlan(
  {...structuredClone(fixture.plan),...changes},
  structuredClone(fixture.inventory)
);
test("static no-route plan is safe for REVIEW ONLY, never a deployment grant",()=>{
 const r=assess();
 assert.equal(r.staticDraftPassed,true,JSON.stringify(r.checks.filter(x=>!x.passed)));
 assert.equal(r.outcome,"SAFE_TO_REVIEW_DRAFT_ONLY");
 for(const field of ["stagingResourcesProven","authorizationProven","privateBrowserAccessProven",
  "readyForStagingDeployment","stagingActivationAuthorized","productionActivationAuthorized"]) {
   assert.equal(r[field],false);
 }
 assert.ok(r.blockers.includes("no_route_plan_cannot_support_network_browser_activation"));
});
test("rejects reuse of existing Worker and D1 resource names",()=>{
 for(const w of fixture.inventory.workers) {
   const r=assess({worker:{...fixture.plan.worker,name:w}});
   assert.equal(r.staticDraftPassed,false,w);
 }
 for(const name of fixture.inventory.databases) {
   const r=assess({database:{...fixture.plan.database,name}});
   assert.equal(r.staticDraftPassed,false,name);
 }
});
test("public routes, preview URLs, workers.dev and custom domains are not permitted",()=>{
 for(const worker of [
  {...fixture.plan.worker,workersDev:true},
  {...fixture.plan.worker,previewUrls:true},
  {...fixture.plan.worker,routes:["agent-staging.thebedesk.com/*"]},
  {...fixture.plan.worker,customDomains:["agent-staging.thebedesk.com"]},
  {...fixture.plan.worker,routes:null}
 ])assert.equal(assess({worker}).staticDraftPassed,false);
});
test("no-route design cannot quietly become a hostname or Access deployment",()=>{
 for(const access of [
  {...fixture.plan.access,hostname:"agent-staging.thebedesk.com"},
  {...fixture.plan.access,mode:"cloudflare-access"},
  {...fixture.plan.access,publicIngress:true}
 ])assert.equal(assess({access}).staticDraftPassed,false);
});
test("no-route staging keeps preview flag OFF and environment staging",()=>{
 for(const flags of [
   {...fixture.plan.flags,APP_ENV:"production"},
   {...fixture.plan.flags,WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"true"},
   {...fixture.plan.flags,WORKSPACE_AGENT_ADVISORY_STAGING_HOST:"agent-staging.thebedesk.com"}
 ])assert.equal(assess({flags}).staticDraftPassed,false);
});
test("no database may be bound or populated without separate approval",()=>{
 for(const database of [
  {...fixture.plan.database,databaseId:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"},
  {...fixture.plan.database,syntheticOnly:false},
  {...fixture.plan.database,productionData:true}
 ])assert.equal(assess({database}).staticDraftPassed,false);
});
test("owner approval, reviewer approval and exact SHA remain unclaimed in a draft",()=>{
 for(const review of [
  {...fixture.plan.review,sourceSha:"a".repeat(40)},
  {...fixture.plan.review,ownerApprovalId:123},
  {...fixture.plan.review,reviewerApprovalId:456},
  {...fixture.plan.review,independentReviewer:"owner"}
 ])assert.equal(assess({review}).staticDraftPassed,false);
});
test("unknown or missing Cloudflare inventory cannot establish even static plan review",()=>{
 assert.equal(assessWorkspaceAgentNoRoutePlan(fixture.plan).staticDraftPassed,false);
 assert.equal(assessWorkspaceAgentNoRoutePlan(fixture.plan,{...fixture.inventory,accountId:"another-account"}).staticDraftPassed,false);
 assert.equal(assessWorkspaceAgentNoRoutePlan(fixture.plan,{...fixture.inventory,workers:[]}).staticDraftPassed,false);
 assert.equal(assessWorkspaceAgentNoRoutePlan(fixture.plan,{...fixture.inventory,databases:null}).staticDraftPassed,false);
 assert.equal(assessWorkspaceAgentNoRoutePlan(fixture.plan,{...fixture.inventory,observedAt:null}).staticDraftPassed,false);
});
test("even forged complete approvals cannot change hard-coded nondeployment result",()=>{
 const s=assess({review:{...fixture.plan.review,ownerApprovalId:"fake",
   reviewerApprovalId:"fake",sourceSha:"b".repeat(40)}});
 assert.equal(s.outcome,"DRAFT_STATIC_POLICY_FAILED");
 assert.equal(s.readyForStagingDeployment,false);
 assert.equal(s.productionActivationAuthorized,false);
});
