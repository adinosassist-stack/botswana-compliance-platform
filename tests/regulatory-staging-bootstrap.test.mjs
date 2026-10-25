import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {prepareStagingBootstrap,EMPTY_DATABASE_QUERY} from "../scripts/prepare-regulatory-staging-bootstrap.mjs";
import {STAGING_REGULATORY_QUERIES} from "../scripts/regulatory-staging-readonly-attestor.mjs";

const options={token:"test-secret",accountId:"a".repeat(32),
  stagingDatabaseId:"11111111-1111-4111-8111-111111111111",
  productionDatabaseId:"22222222-2222-4222-8222-222222222222",
  expectedStagingName:"bw-compliance-os-regulatory-staging"};
function provider({count=0,metadata={},result,ok=true}={}){
  const calls=[];
  return {calls,fetchImpl:async(url,init)=>{
    calls.push({url,init});
    return {ok,status:ok?200:400,json:async()=>({success:ok,result:url.endsWith("/query")
      ?result??[{success:true,results:[{object_count:count}]}]
      :{uuid:options.stagingDatabaseId,name:options.expectedStagingName,...metadata}})};
  }};
}
test("only exact verified empty staging yields an isolated Wrangler binding",async()=>{
  const p=provider();const config=await prepareStagingBootstrap({...options,...p});
  assert.deepEqual(config.d1_databases,[{binding:"STAGING_DB",database_id:options.stagingDatabaseId,database_name:options.expectedStagingName}]);
  assert.equal(p.calls.length,2);
  assert.equal(p.calls[0].init.method,undefined);
  assert.deepEqual(JSON.parse(p.calls[1].init.body),{sql:EMPTY_DATABASE_QUERY,params:[]});
  assert.equal(p.calls[1].init.redirect,"error");
  assert.ok(!JSON.stringify(config).includes(options.token));
});
test("production IDs, invalid identities and existing schema fail closed",async()=>{
  for(const patch of [
    {stagingDatabaseId:options.productionDatabaseId},
    {stagingDatabaseId:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"},
    {expectedStagingName:"bw-compliance-os"}
  ]){
    const p=provider();await assert.rejects(prepareStagingBootstrap({...options,...patch,...p}));assert.equal(p.calls.length,0);
  }
  for(const metadata of [{uuid:options.productionDatabaseId},{name:"different-staging"}]){
    const p=provider({metadata});await assert.rejects(prepareStagingBootstrap({...options,...p}));assert.equal(p.calls.length,1);
  }
  const p=provider({count:1});
  await assert.rejects(prepareStagingBootstrap({...options,...p}),/requires_empty_database/);
});
test("malformed provider inventories and network failures cannot authorize bootstrap",async()=>{
  for(const result of [[],[{}],[{success:true,results:[]}],[{success:true,results:[{object_count:"0"}]}]]){
    await assert.rejects(prepareStagingBootstrap({...options,...provider({result})}),/inventory_invalid/);
  }
  await assert.rejects(prepareStagingBootstrap({...options,fetchImpl:async()=>{throw new Error("sensitive provider detail")}}),/staging_cloudflare_unavailable/);
});
test("checked-in baseline repairs all four missing-schema queries without tenant or regulatory data",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value BLOB)");
    assert.equal(db.prepare(EMPTY_DATABASE_QUERY).get().object_count,0);
    assert.throws(()=>db.prepare(STAGING_REGULATORY_QUERIES.sources).all(),/no such table/);
    db.exec(readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8"));
    assert.ok(db.prepare(EMPTY_DATABASE_QUERY).get().object_count>0);
    for(const sql of Object.values(STAGING_REGULATORY_QUERIES))assert.deepEqual(db.prepare(sql).all(),[]);
    for(const table of ["tenants","users","regulatory_sources","regulatory_rules","compliance_obligations"])
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{db.close()}
});

test("bootstrap workflow requires protected manual exact-main authority and a separate write secret",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/regulatory-staging-empty-bootstrap.yml",import.meta.url),"utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/^  (push|pull_request|schedule|workflow_run):/m);
  assert.match(workflow,/default: DO_NOT_RUN/);
  assert.match(workflow,/inputs.confirmation == 'INITIALIZE_EMPTY_STAGING'/);
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/environment: regulatory-staging/);
  assert.match(workflow,/group: thebe-regulatory-staging-readonly/);
  assert.match(workflow,/\$EXPECTED_SHA\" == \"\$GITHUB_SHA/);
  assert.match(workflow,/\$live_sha\" == \"\$EXPECTED_SHA/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/contents: read/);
  const beforeImport=workflow.split("      - name: Verify identity and emptiness then load reviewed baseline")[0];
  assert.doesNotMatch(beforeImport,/CLOUDFLARE_API_TOKEN:/);
  assert.match(workflow,/secrets.REGULATORY_STAGING_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(workflow,/environment: production|secrets.CLOUDFLARE_API_TOKEN\b|vars.D1_DATABASE_ID\b/);
  assert.match(workflow,/prepare-regulatory-staging-bootstrap.mjs/);
  assert.match(workflow,/d1 execute STAGING_DB --config "\$config" --remote --file "\$GITHUB_WORKSPACE\/cloudflare\/schema.sql" --yes/);
  assert.match(workflow,/run-regulatory-staging-readonly-preflight.mjs/);
  assert.doesNotMatch(workflow,/wrangler (deploy|publish)|foundation-pack\/import/);
});
