import test from "node:test";
import assert from "node:assert/strict";
import {assertPrivateFixtureScope, withPrivateSyntheticFixture} from "../cloudflare/src/general-ai-private-fixture-lifecycle.js";

const fixtureId = "ga-test-" + "a".repeat(32);
const scope = Object.freeze({
  appEnv:"staging", databaseId:"ff229eef-7724-49ae-9d68-d3a1db669b63",
  workerName:"bw-general-ai-staging", generalAiEnabled:false, researchEnabled:false,
  publicRouteEnabled:false, independentApproval:true, stagingWriteApproved:true,
  exactMainApproved:true
});
function adapter(failAt) {
  const records = new Set(), calls=[];
  return {
    records,calls,
    async create(kind,id) {
      calls.push("create:"+kind);
      records.add(id+":"+kind);
      if(failAt==="create:"+kind) throw Error("injected_create_failure");
    },
    async remove(kind,id) {
      calls.push("remove:"+kind);
      if(failAt==="remove:"+kind) throw Error("injected_cleanup_failure");
      records.delete(id+":"+kind);
    },
    async assertAbsent(id) {
      calls.push("assertAbsent");
      if([...records].some(x=>x.startsWith(id+":")))throw Error("residual_fixture");
    }
  };
}

test("requires exact staging, isolated database, private worker and independent approvals",()=>{
  assert.doesNotThrow(()=>assertPrivateFixtureScope(scope));
  for(const [field,value] of Object.entries({
    appEnv:"production", databaseId:"production", workerName:"bw-compliance-os",
    generalAiEnabled:true,researchEnabled:true,publicRouteEnabled:true,
    independentApproval:false,stagingWriteApproved:false,exactMainApproved:false
  }))assert.throws(()=>assertPrivateFixtureScope({...scope,[field]:value}));
});
test("runs synthetic exercise then deletes session, membership, user and verifies absence",async()=>{
  const a=adapter();
  const result=await withPrivateSyntheticFixture({scope,fixtureId,adapter:a,exercise:async ({fixtureId:id})=>{
    assert.equal(id,fixtureId);
    assert.equal(a.records.size,3);
    return "completed";
  }});
  assert.equal(result.cleanupVerified,true);
  assert.equal(result.result,"completed");
  assert.equal(a.records.size,0);
  assert.deepEqual(a.calls,["assertAbsent","create:user","create:membership","create:session","remove:session","remove:membership","remove:user","assertAbsent"]);
});
test("exercise error does not skip cleanup",async()=>{
  const a=adapter();
  await assert.rejects(()=>withPrivateSyntheticFixture({scope,fixtureId,adapter:a,exercise:async()=>{throw Error("simulated_test_failure")}}),/simulated_test_failure/);
  assert.equal(a.records.size,0);
  assert.equal(a.calls.at(-1),"assertAbsent");
});
test("partially completed database write is also cleaned",async()=>{
  const a=adapter("create:membership");
  await assert.rejects(()=>withPrivateSyntheticFixture({scope,fixtureId,adapter:a,exercise:async()=>{throw Error("must_not_run")}}),/injected_create_failure/);
  assert.equal(a.records.size,0);
  assert.deepEqual(a.calls,["assertAbsent","create:user","create:membership","remove:membership","remove:user","assertAbsent"]);
});
test("cleanup error fails closed and never claims success",async()=>{
  const a=adapter("remove:session");
  await assert.rejects(()=>withPrivateSyntheticFixture({scope,fixtureId,adapter:a,exercise:async()=>true}),/fixture_cleanup_unverified:session,residual_records/);
  assert.equal(a.calls.at(-1),"assertAbsent");
});
test("production or untrusted identifiers cannot even invoke an adapter",async()=>{
  const a=adapter();
  for(const id of ["customer-123","ga-test-../../danger","ga-test-"+"z".repeat(32),"GA-TEST-"+"a".repeat(32)]){
    await assert.rejects(()=>withPrivateSyntheticFixture({scope,fixtureId:id,adapter:a,exercise:async()=>{}}),/fixture_synthetic_id_required/);
  }
  await assert.rejects(()=>withPrivateSyntheticFixture({scope:{...scope,appEnv:"production"},fixtureId,adapter:a,exercise:async()=>{}}),/fixture_nonstaging_forbidden/);
  assert.equal(a.calls.length,0);
});
test("missing cleanup/verification capabilities fail before creating any records",async()=>{
  let calls=0;
  await assert.rejects(()=>withPrivateSyntheticFixture({scope,fixtureId,adapter:{create:()=>calls++},exercise:async()=>{}}),/fixture_adapter_required/);
  assert.equal(calls,0);
});

test("pre-existing synthetic ID fails before creation or deletion",async()=>{
  const a=adapter();
  a.records.add(fixtureId+":user");
  await assert.rejects(()=>withPrivateSyntheticFixture({scope,fixtureId,adapter:a,exercise:async()=>{throw Error("exercise_must_not_run")}}),/residual_fixture/);
  assert.deepEqual(a.calls,["assertAbsent"]);
  assert.equal(a.records.has(fixtureId+":user"),true);
});
