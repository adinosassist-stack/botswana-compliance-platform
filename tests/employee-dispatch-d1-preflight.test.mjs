import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmployeeDispatchD1Preflight } from "../cloudflare/src/employee-dispatch-d1-preflight.js";

const good = {tenantId:"tenant-a",proposalKey:JSON.stringify(["employee-proposal-v2","tenant-a","author-a","workflow-a","a".repeat(64),"employee-a","onboarding_checklist","2026-10-23","b".repeat(64)]),featureEnabled:true,killSwitch:false,auditAvailable:true};
function fixture(row) {
  const calls=[];
  const db={prepare(sql){calls.push({sql});return {bind(...args){calls[calls.length-1].args=args;return {async first(){if(row instanceof Error)throw row;return row;}};}};}};
  return {store:createEmployeeDispatchD1Preflight(db),calls};
}
test("preflight denies by default without database access",async()=>{
  const f=fixture({});
  assert.deepEqual(await f.store.check({tenantId:good.tenantId,proposalKey:good.proposalKey}),{eligible:false,reason:"governance_unavailable"});
  assert.equal(f.calls.length,0);
});
test("preflight requires exact boolean controls",async()=>{
  for(const patch of [{featureEnabled:"true"},{killSwitch:0},{auditAvailable:1},{killSwitch:true},{auditAvailable:false}]){
    const f=fixture({});
    assert.deepEqual(await f.store.check({...good,...patch}),{eligible:false,reason:"governance_unavailable"});
    assert.equal(f.calls.length,0);
  }
});
test("preflight rejects malformed scope",async()=>{
  for(const patch of [{tenantId:"other tenant"},{proposalKey:""},{proposalKey:"x".repeat(2049)}]){
    const f=fixture({});
    assert.deepEqual(await f.store.check({...good,...patch}),{eligible:false,reason:"invalid_scope"});
    assert.equal(f.calls.length,0);
  }
});
test("preflight uses canonical SQL and binds tenant and full versioned key",async()=>{
  const f=fixture({proposal_revision:"b".repeat(64),workflow_revision:"a".repeat(64)});
  const result=await f.store.check(good);
  assert.equal(result.eligible,true);
  assert.equal(result.reason,"snapshot_only_no_execution_authority");
  assert.deepEqual(f.calls[0].args,[good.tenantId,good.proposalKey]);
  assert.match(f.calls[0].sql,/employee_ai_proposal_provenance/);
  assert.match(f.calls[0].sql,/reviewer\.status='active'/);
  assert.equal(Object.hasOwn(result,"executed"),false);
});
test("preflight denies missing approval and storage errors",async()=>{
  for(const row of [null,{},new Error("D1 unavailable")]){
    const f=fixture(row);
    assert.equal((await f.store.check(good)).eligible,false);
  }
});
test("preflight requires D1 prepare capability",()=>{
  assert.throws(()=>createEmployeeDispatchD1Preflight({}),/invalid_d1/);
});
