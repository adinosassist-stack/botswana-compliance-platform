/**
 * Corporate Assets source-only schema construction and evidence receipt.
 *
 * No network, token loading, Wrangler, Cloudflare API or D1 execution path.
 * Output is not permission to initialize, deploy, restore or activate anything.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {renderCorporateAssetsStagingConfig,corporateAssetsStagingMarkerSql}
 from './render-corporate-assets-staging-config.mjs';

export const ASSETS_ISOLATED_DB_ID='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
export const ASSETS_ISOLATED_DB_NAME='bw-corporate-assets-staging';
export const ASSETS_PROD_DB_ID='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';

const READ_ONLY_SOURCE_PATHS=Object.freeze([
 '../cloudflare/schema.sql',
 '../cloudflare/migrations/004_v56_audit_lineage.sql',
 '../cloudflare/schema/corporate-assets.sql'
]);
const BASE_TABLES=Object.freeze(['tenants','users','memberships','auth_rate_limits','sessions','audit_events']);
const AUDIT_TABLES=Object.freeze(['audit_chain_state','audit_write_failures','audit_integrity_checks']);
const ASSETS_TABLES=Object.freeze(['corporate_assets','corporate_asset_services']);
const digest=x=>createHash('sha256').update(x).digest('hex');
const sha=/^[0-9a-f]{40}$/;

function requireUniqueMatch(text,re,label){
 const matches=[...text.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))];
 if(matches.length!==1)throw Error('offline_ddl_missing_or_ambiguous_'+label);
 return matches[0][0].trim();
}
function tableDDL(text,name){
 const re=new RegExp('CREATE TABLE(?: IF NOT EXISTS)?\\s+'+name+'\\s*\\([\\s\\S]*?\\n\\);','i');
 return requireUniqueMatch(text,re,name);
}
function sources(read=readFileSync){
 const [canonical,migration,assets]=READ_ONLY_SOURCE_PATHS.map(relative=>read(new URL(relative,import.meta.url),'utf8'));
 return {canonical,migration,assets};
}

/**
 * This minimal staging-only SQL bundle reuses reviewed canonical table DDL.
 * It is executable ONLY by local in-memory test harnesses in this repository.
 * Never pass the returned SQL to a Cloudflare client or a remote D1 runner.
 */
export function buildOfflineAssetsStagingSql({expectedMainSha,read=readFileSync}={}){
 if(!sha.test(expectedMainSha||''))throw Error('expected_exact_main_sha_required');
 const config=renderCorporateAssetsStagingConfig({
  ASSETS_STAGING_D1_ID:ASSETS_ISOLATED_DB_ID,
  PRODUCTION_D1_DATABASE_ID:ASSETS_PROD_DB_ID,
  ASSETS_STAGING_SOURCE_SHA:expectedMainSha
 });
 if(config.workers_dev!==false||config.preview_urls!==false||config.routes.length||
    config.vars.ASSETS_STAGING_WRITES_ENABLED!=='false'||config.vars.THEBE_CORPORATE_ASSETS_ENABLED!=='false')
  throw Error('staging_feature_hold_required');
 const parts=sources(read);
 const auditAlter=parts.migration.match(/^ALTER TABLE audit_events ADD COLUMN [^;]+;$/gm)||[];
 if(auditAlter.length!==5)throw Error('canonical_audit_alteration_count_changed');
 const auditIndex=requireUniqueMatch(parts.migration,
  /CREATE UNIQUE INDEX IF NOT EXISTS audit_tenant_seq_unique[\s\S]*?;/i,'audit_sequence_index');
 const tables=[
  ...BASE_TABLES.map(name=>tableDDL(parts.canonical,name)),
  ...auditAlter,
  auditIndex,
  ...AUDIT_TABLES.map(name=>tableDDL(parts.migration,name)),
  parts.assets.trim(),
  corporateAssetsStagingMarkerSql({
   ASSETS_STAGING_D1_ID:ASSETS_ISOLATED_DB_ID,
   PRODUCTION_D1_DATABASE_ID:ASSETS_PROD_DB_ID,
   ASSETS_STAGING_SOURCE_SHA:expectedMainSha
  }).trim()
 ];
 const sql='PRAGMA foreign_keys=ON;\n'+tables.join('\n')+'\n';
 // A destructive DDL construct in the selected canonical sources is unexpected.
 if(/\b(?:DROP|TRUNCATE|ATTACH|DETACH|VACUUM|REPLACE)\b/i.test(sql))
  throw Error('destructive_or_external_sql_forbidden');
 const sourceHashes=Object.freeze({
  canonical_sha256:digest(parts.canonical),
  audit_migration_sha256:digest(parts.migration),
  corporate_assets_sha256:digest(parts.assets)
 });
 return Object.freeze({sql,sql_sha256:digest(sql),sourceHashes,
  expectedMainSha,targetDatabaseId:ASSETS_ISOLATED_DB_ID,
  requiredTables:Object.freeze([...BASE_TABLES,...AUDIT_TABLES,...ASSETS_TABLES,'corporate_assets_staging_identity'])});
}

/**
 * Consume externally supplied metadata ONLY for an informational receipt.
 * Metadata does not establish credential scope, exclusivity, backup, source
 * provenance, target emptiness under concurrency, or remote write authority.
 */
export function offlineAssetsBootstrapReceipt({
 expectedMainSha,observedMainSha,metadata,read=readFileSync
}={}){
 if(!sha.test(observedMainSha||'')||observedMainSha!==expectedMainSha)
  throw Error('exact_main_attestation_required');
 if(metadata?.name!==ASSETS_ISOLATED_DB_NAME||
    metadata?.uuid!==ASSETS_ISOLATED_DB_ID||
    metadata?.num_tables!==0)
  throw Error('isolated_empty_database_metadata_required');
 const plan=buildOfflineAssetsStagingSql({expectedMainSha,read});
 const body={
  schema:'thebe.assets.offline-d1-bootstrap-receipt.v1',
  mode:'OFFLINE_SOURCE_REVIEW_ONLY',
  sourceSha:expectedMainSha,targetName:ASSETS_ISOLATED_DB_NAME,targetId:ASSETS_ISOLATED_DB_ID,
  observedTables:metadata.num_tables,
  sqlSha256:plan.sql_sha256,
  sourceHashes:plan.sourceHashes,
  tableNames:plan.requiredTables,
  remoteSchemaVerified:false,restoredInCloudflare:false,
  productionDatabaseIncluded:false,protectedWriteAuthorized:false,
  sourceToCloudflareBytesProven:false,
  separateOwnerApprovalRequired:true,separateThusicoApprovalRequired:true
 };
 return Object.freeze({...body,receiptSha256:digest(JSON.stringify(body))});
}
