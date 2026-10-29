import test from "node:test";
import assert from "node:assert/strict";
import {createAuthorizedAgentBudgetService} from "../server/agentic/agent-budget-authorized-service.mjs";
const policy={tenantId:"t",agentId:"a",enabled:true,stopped:false,version:1};
const request={agentId:"a",requestId:"r",costMinor:10,expectedVersion:1,occurredAt:"now"};
async function service(session,loadedPolicy=policy){
 let calls=0;
 const api=await createAuthorizedAgentBudgetService({
  sessionProvider:async()=>session,
  policyProvider:async()=>{calls++;return loadedPolicy},
  transactionAdapter:{transaction:async fn=>fn({get:async()=>null,run:async()=>({changes:1}),appendAudit:async()=>{}})}
 });
 return {api,policyCalls:()=>calls};
}
test("unauthenticated caller never reaches policy store",async()=>{const s=await service({authenticated:false});assert.equal((await s.api.reserve(request)).status,"unauthorized");assert.equal(s.policyCalls(),0)});
test("non-owner cannot reserve",async()=>{const s=await service({authenticated:true,tenantId:"t",actorId:"u",role:"member"});assert.equal((await s.api.reserve(request)).status,"unauthorized")});
test("owner may reserve against matching trusted tenant policy",async()=>{const s=await service({authenticated:true,tenantId:"t",actorId:"owner",role:"owner"});assert.equal((await s.api.reserve(request)).status,"reserved")});
test("cross-tenant policy is rejected",async()=>{const s=await service({authenticated:true,tenantId:"t",actorId:"owner",role:"owner"},{...policy,tenantId:"other"});assert.equal((await s.api.reserve(request)).status,"denied")});
test("stopped policy is rejected",async()=>{const s=await service({authenticated:true,tenantId:"t",actorId:"owner",role:"owner"},{...policy,stopped:true});assert.equal((await s.api.reserve(request)).status,"denied")});
