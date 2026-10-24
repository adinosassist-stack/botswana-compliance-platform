import test from "node:test";
import assert from "node:assert/strict";
import {BOTSWANA_FOUNDATION_PACK_V1} from "../cloudflare/src/generated/foundation-pack-v1.js";
import {foundationSourceDesired} from "../cloudflare/src/regulatory-foundation-source-reconciliation.js";
import {createStagingRegulatoryAttestor,STAGING_REGULATORY_QUERIES} from "../scripts/regulatory-staging-readonly-attestor.mjs";

const stagingDatabaseId="11111111-1111-4111-8111-111111111111";
const productionDatabaseId="22222222-2222-4222-8222-222222222222";
const expectedStagingName="bw-compliance-os-regulatory-staging";
const accountId="a".repeat(32),token="sensitive-credential-must-not-appear";
const source=BOTSWANA_FOUNDATION_PACK_V1.sources[0];
const desired=foundationSourceDesired(source,BOTSWANA_FOUNDATION_PACK_V1.packKey);
const row={
  id:"source-existing-1",...desired,status:"pending",verification_status:"unverified",
  latest_snapshot_version:0,snapshot_count:0,review_count:0,created_at:"2026-01-01",
  content_hash:null,metadata_hash:null,approved_by_user_id:null,approved_at:null
};
const registry=[{
  pack_key:BOTSWANA_FOUNDATION_PACK_V1.packKey,seed_key:"source:"+source.key,
  entity_type:"source",entity_id:row.id,definition_hash:"v17-hash"
}];
const legacyRule={
  id:"approved-vat-1",rule_key:"bw.burs.vat.return-payment.25-days",
  version:1,status:"published",effective_to:null,action_json:JSON.stringify({
    operationalization:"vat_category_period",dueDaysAfterPeriodEnd:25
  })
};
const inventory=[{
  rule_key:legacyRule.rule_key,version:1,rule_status:"published",
  total_obligations:3,affected_tenants:2,completed_obligations:1,
  schedules:2,ready_schedules:1,needs_input_schedules:1
}];

function simulatedCloudflare({
  sources=[row],registryRows=registry,legacyRules=[],inventoryRows=[],dbName=expectedStagingName,
  sourceTruncation=false,malformed=false
}={}){
  const calls=[];
  const lists=[sources,registryRows,legacyRules,inventoryRows];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,method:options.method||"GET",options});
    if(!options.method)return {ok:true,json:async()=>({success:true,result:{uuid:stagingDatabaseId,name:dbName}})};
    assert.equal(options.method,"POST");
    assert.equal(options.redirect,"error");
    assert.equal(options.headers.Authorization,"Bearer "+token);
    assert.match(url,/\/query$/);
    const payload=JSON.parse(options.body);
    assert.deepEqual(payload.params,[]);
    const index=Object.values(STAGING_REGULATORY_QUERIES).indexOf(payload.sql);
    assert.ok(index>=0,"SQL must be one of four pinned inspection queries");
    assert.equal(index,calls.filter(c=>c.method==="POST").length-1,"pinned queries must retain a documented order");
    const rows=sourceTruncation&&index===0?Array.from({length:5000},()=>row):lists[index];
    return {ok:true,json:async()=>({success:true,result:malformed?[]:[{success:true,results:rows}]})};
  };
  return {fetchImpl,calls};
}
function attestor(fetchImpl,overrides={}){
  return createStagingRegulatoryAttestor({
    token,accountId,stagingDatabaseId,productionDatabaseId,expectedStagingName,
    fetchImpl,now:()=>"2026-10-24T20:00:00.000Z",...overrides
  });
}

test("pinned API requests are read-only and produce a redacted review-only attestation",async()=>{
  const fake=simulatedCloudflare();
  const result=await attestor(fake.fetchImpl).attest();
  assert.equal(result.kind,"regulatory_staging_readonly_attestation");
  assert.equal(result.decision,"human_review_required");
  assert.equal(result.noApprovalOrImport,true);
  assert.equal(result.readOnly,true);
  assert.equal(result.staging.name,expectedStagingName);
  assert.equal(result.staging.databaseFingerprint.length,16);
  assert.equal(result.pack.version,"1.8");
  assert.equal(result.sources.counts.reuse,1);
  assert.equal(result.sources.counts.create,23);
  assert.equal(result.blockers.sourceMetadataDrift,0);
  assert.equal(result.blockers.activeLegacyVatRules,0);
  assert.equal(fake.calls.length,5);
  assert.deepEqual(fake.calls.map(c=>c.method),["GET","POST","POST","POST","POST"]);
  const publicJson=JSON.stringify(result);
  for(const prohibited of [token,stagingDatabaseId,productionDatabaseId,"source notes secret"])
    assert.ok(!publicJson.includes(prohibited));
  assert.equal(fake.calls.every(c=>c.options.redirect==="error"),true);
});

test("approved evidence drift and live legacy VAT rules become blockers without changing staging",async()=>{
  const protectedSource={...row,title:"Obsolete 2026 description",
    status:"approved",verification_status:"verified",latest_snapshot_version:1,snapshot_count:1};
  const fake=simulatedCloudflare({
    sources:[protectedSource],legacyRules:[legacyRule],inventoryRows:inventory
  });
  const report=await attestor(fake.fetchImpl).attest();
  assert.equal(report.blockers.sourceMetadataDrift,1);
  assert.equal(report.sources.ok,false);
  assert.equal(report.blockers.activeLegacyVatRules,1);
  assert.equal(report.blockers.priorLegacyVatObligations,3);
  assert.equal(report.legacyVat.rules[0].ruleKey,legacyRule.rule_key);
  assert.ok(fake.calls.every(c=>!["PATCH","PUT","DELETE"].includes(c.method)));
  assert.equal(report.legacyVatObligationInventory[0].affected_tenants,2);
  assert.ok(!JSON.stringify(report).includes("sensitive@example.test"),"attestation must never expose a tenant email");
});

test("target must be a separate named staging database before any remote query",async()=>{
  const fake=simulatedCloudflare();
  assert.throws(()=>attestor(fake.fetchImpl,{productionDatabaseId:stagingDatabaseId}),/staging_target_configuration_invalid/);
  assert.throws(()=>attestor(fake.fetchImpl,{expectedStagingName:"bw-compliance-os"}),/staging_target_configuration_invalid/);
  assert.throws(()=>attestor(fake.fetchImpl,{stagingDatabaseId:"bad"}),/staging_target_configuration_invalid/);
  assert.throws(()=>attestor(fake.fetchImpl,{accountId:"bad"}),/staging_target_configuration_invalid/);
  assert.equal(fake.calls.length,0);
  await assert.rejects(attestor(simulatedCloudflare({dbName:"bw-compliance-os"}).fetchImpl).attest(),/staging_database_identity_mismatch/);
});

test("unverifiable D1 query sets, oversized scans and PII fail closed",async()=>{
  for(const fixture of [
    {malformed:true},
    {sourceTruncation:true},
    {inventoryRows:[{rule_key:"old",total_obligations:1,email:"sensitive@example.test"}]}
  ]){
    const fake=simulatedCloudflare(fixture);
    await assert.rejects(attestor(fake.fetchImpl).attest(),/staging_(?:query_result_invalid|query_limit_reached|inventory_contains_identifiers)/);
  }
});

test("no token, body or customer values are surfaced through cloudflare errors",async()=>{
  const fake=simulatedCloudflare();
  const fetchImpl=async(...args)=>{
    if(args[1]?.method==="POST")throw new Error("D1 sensitive "+token);
    return fake.fetchImpl(...args);
  };
  await assert.rejects(attestor(fetchImpl).attest(),e=>e.message==="staging_cloudflare_unavailable");
});

test("inspection query names and commands never perform D1 mutations",()=>{
  assert.deepEqual(Object.keys(STAGING_REGULATORY_QUERIES),["sources","registry","legacyRules","obligationCounts"]);
  for(const query of Object.values(STAGING_REGULATORY_QUERIES)){
    const normalized=query.replace(/^--[^\n]*(?:\n|$)/gm,"").trim();
    assert.match(normalized,/^(SELECT|WITH)\b/i);
    assert.doesNotMatch(normalized,/\b(?:UPDATE|DELETE|INSERT|ALTER|DROP|REPLACE|VACUUM|PRAGMA)\b/i);
  }
});
