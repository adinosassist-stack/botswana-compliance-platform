import test from "node:test";
import assert from "node:assert/strict";
import {handleAgentApprovalHistoryHttp} from "../server/agent-approval-history-http-adapter.js";
const principal={authenticated:true,tenantId:"tenant-a",actorId:"owner-a",actorRole:"owner"};
test("all security guards run in order before any DB query",async()=>{
 const calls=[];
 const guards=Object.fromEntries(["verifySession","verifyTenantMembership","verifyOrigin","checkRateLimit","verifyAuditAvailability"].map(name=>[name,async()=>{calls.push(name);return true;}]));
 const pool={async query(){calls.push("query");return {rows:[]};}};
 const r=await handleAgentApprovalHistoryHttp({request:{method:"GET"},principal,pool,guards,featureEnabled:true});
 assert.equal(r.status,200);
 assert.deepEqual(calls,["verifySession","verifyTenantMembership","verifyOrigin","checkRateLimit","verifyAuditAvailability","query"]);
});
test("any guard exception prevents all subsequent guards and storage",async()=>{
 const names=["verifySession","verifyTenantMembership","verifyOrigin","checkRateLimit","verifyAuditAvailability"];
 for(let i=0;i<names.length;i++){
  const calls=[];
  const guards=Object.fromEntries(names.map((name,index)=>[name,async()=>{calls.push(name);if(index===i)throw Error("guard down");return true;}]));
  const pool={async query(){calls.push("query");return {rows:[]};}};
  const r=await handleAgentApprovalHistoryHttp({request:{method:"GET"},principal,pool,guards,featureEnabled:true});
  assert.equal(r.status,503);assert.deepEqual(calls,names.slice(0,i+1));
 }
});
