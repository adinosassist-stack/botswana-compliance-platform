// Read-only Cloudflare D1 staging attestation for Botswana foundation v1.8.
// No D1 write is ever constructed. This module cannot approve or import a rule.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {BOTSWANA_FOUNDATION_PACK_V1,BOTSWANA_FOUNDATION_PACK_V1_HASH} from "../cloudflare/src/generated/foundation-pack-v1.js";
import {inspectFoundationSourceMetadata,publicFoundationSourcePreflight} from "../cloudflare/src/regulatory-foundation-source-reconciliation.js";
import {isActiveLegacyVatRule} from "../cloudflare/src/regulatory-foundation-legacy-vat.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT=/^[a-f0-9]{32}$/i;
const PACK=BOTSWANA_FOUNDATION_PACK_V1;
const SOURCE_LIMIT=5000,REGISTRY_LIMIT=2500,RULE_LIMIT=2500;
const fail=code=>{throw new Error(code)};

// Four pinned, inspectable queries; no client-provided SQL text.
export const STAGING_REGULATORY_QUERIES=Object.freeze({
  sources:`SELECT s.id,s.authority,s.title,s.source_url,s.source_type,
    s.publication_date,s.effective_date,s.notes,s.status,s.verification_status,
    s.latest_snapshot_version,s.created_at,
    CASE WHEN s.content_hash IS NULL THEN NULL ELSE 'present' END AS content_hash,
    CASE WHEN s.metadata_hash IS NULL THEN NULL ELSE 'present' END AS metadata_hash,
    CASE WHEN s.approved_by_user_id IS NULL THEN NULL ELSE 'present' END AS approved_by_user_id,
    CASE WHEN s.approved_at IS NULL THEN NULL ELSE 'present' END AS approved_at,
    (SELECT COUNT(*) FROM regulatory_source_snapshots ss WHERE ss.source_id=s.id) AS snapshot_count,
    (SELECT COUNT(*) FROM regulatory_source_reviews sr WHERE sr.source_id=s.id) AS review_count
    FROM regulatory_sources s WHERE s.jurisdiction='BW'
    ORDER BY s.created_at,s.id LIMIT 5000`,
  registry:`SELECT pack_key,seed_key,entity_type,entity_id,definition_hash
    FROM regulatory_seed_registry
    WHERE pack_key='botswana-foundation-v1' AND entity_type='source'
    ORDER BY seed_key LIMIT 2500`,
  legacyRules:`SELECT id,rule_key,status,effective_to,action_json,version
    FROM regulatory_rules WHERE status IN ('approved','published')
    ORDER BY rule_key,version DESC LIMIT 2500`,
  obligationCounts:readFileSync(
    new URL("../cloudflare/queries/regulatory-legacy-vat-obligations-readonly.sql",import.meta.url),
    "utf8")
});

function assertReadOnly(sql){
  const trimmed=String(sql).replace(/^--[^\n]*(?:\n|$)/gm,"").trim();
  if(!/^(SELECT|WITH)\b/i.test(trimmed)||/\b(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM)\b/i.test(trimmed))
    fail("staging_query_not_read_only");
}
for(const sql of Object.values(STAGING_REGULATORY_QUERIES))assertReadOnly(sql);

function localD1Adapter(sources,registry){
  return {prepare(sql){
    if(sql.startsWith("SELECT entity_id,definition_hash FROM regulatory_seed_registry "))
      return {bind:(packKey,seedKey)=>({first:async()=>registry.find(
        r=>r.pack_key===packKey&&r.seed_key===seedKey&&r.entity_type==="source")||null})};
    if(sql.includes("FROM regulatory_sources s")&&sql.includes("WHERE s.id=? LIMIT 1"))
      return {bind:id=>({first:async()=>sources.find(x=>x.id===id)||null})};
    if(sql.includes("FROM regulatory_sources s")&&sql.includes("WHERE s.source_url=? ORDER BY s.created_at,s.id LIMIT 1"))
      return {bind:url=>({first:async()=>sources.filter(x=>x.source_url===url)
        .sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||""))||
          String(a.id).localeCompare(String(b.id)))[0]||null})};
    fail("staging_unexpected_source_query");
  }};
}

export function createStagingRegulatoryAttestor({
  token,accountId,stagingDatabaseId,productionDatabaseId,expectedStagingName,
  fetchImpl=globalThis.fetch,now=()=>new Date().toISOString()
}={}){
  if(typeof token!=="string"||!token.trim()||!ACCOUNT.test(String(accountId||""))||
    !UUID.test(String(stagingDatabaseId||""))||!UUID.test(String(productionDatabaseId||""))||
    stagingDatabaseId.toLowerCase()===productionDatabaseId.toLowerCase()||
    typeof expectedStagingName!=="string"||
    !/(?:^|[-_])(staging|evaluation|sandbox|test)(?:$|[-_])/i.test(expectedStagingName)||
    expectedStagingName==="bw-compliance-os"||typeof fetchImpl!=="function")
    fail("staging_target_configuration_invalid");
  if(PACK.packKey!=="botswana-foundation-v1"||String(PACK.version)!=="1.8")
    fail("staging_pack_version_unexpected");
  const base=`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${stagingDatabaseId}`;
  const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"application/json"};
  let verified=false;
  async function cloudflare(url,options={}){
    let response,body;
    try{
      response=await fetchImpl(url,{...options,headers,redirect:"error",signal:AbortSignal.timeout(20000)});
      body=await response.json();
    }catch{fail("staging_cloudflare_unavailable")}
    if(!response.ok||body?.success!==true)fail("staging_cloudflare_unavailable");
    return body.result;
  }
  async function verifyTarget(){
    verified=false;
    const metadata=await cloudflare(base);
    if(metadata?.uuid?.toLowerCase()!==stagingDatabaseId.toLowerCase()||
      metadata?.name!==expectedStagingName)
      fail("staging_database_identity_mismatch");
    verified=true;
  }
  async function query(sql){
    if(!verified||!Object.values(STAGING_REGULATORY_QUERIES).includes(sql))fail("staging_query_not_allowed");
    assertReadOnly(sql);
    const batches=await cloudflare(base+"/query",{method:"POST",body:JSON.stringify({sql,params:[]})});
    if(!Array.isArray(batches)||batches.length!==1||
      batches[0]?.success!==true||!Array.isArray(batches[0].results))
      fail("staging_query_result_invalid");
    return batches[0].results;
  }
  async function attest(){
    await verifyTarget();
    const sources=await query(STAGING_REGULATORY_QUERIES.sources);
    const registry=await query(STAGING_REGULATORY_QUERIES.registry);
    const rules=await query(STAGING_REGULATORY_QUERIES.legacyRules);
    const obligations=await query(STAGING_REGULATORY_QUERIES.obligationCounts);
    if(sources.length===SOURCE_LIMIT||registry.length===REGISTRY_LIMIT||rules.length===RULE_LIMIT)
      fail("staging_query_limit_reached");
    const plan=await inspectFoundationSourceMetadata(localD1Adapter(sources,registry),PACK);
    const legacy=rules.filter(x=>isActiveLegacyVatRule(x)).map(x=>({
      ruleKey:String(x.rule_key||""),version:Number(x.version||0),status:String(x.status||""),
      effectiveTo:x.effective_to||null
    }));
    const totals=obligations.reduce((sum,row)=>sum+Number(row.total_obligations||0),0);
    if(obligations.some(row=>Object.keys(row).some(k=>/tenant_id|actor_user_id|email|obligation_key|description|title/i.test(k))))
      fail("staging_inventory_contains_identifiers");
    return {
      kind:"regulatory_staging_readonly_attestation",readOnly:true,
      noApprovalOrImport:true,
      observedAt:now(),
      staging:{name:expectedStagingName,
        databaseFingerprint:createHash("sha256").update(stagingDatabaseId.toLowerCase()).digest("hex").slice(0,16)},
      pack:{packKey:PACK.packKey,version:PACK.version,hash:BOTSWANA_FOUNDATION_PACK_V1_HASH},
      decision:"human_review_required",
      blockers:{sourceMetadataDrift:plan.counts.source_metadata_drift_requires_review,
        activeLegacyVatRules:legacy.length,priorLegacyVatObligations:totals},
      sources:publicFoundationSourcePreflight(plan),
      legacyVat:{count:legacy.length,rules:legacy},
      legacyVatObligationInventory:obligations
    };
  }
  return {verifyTarget,query,attest};
}
