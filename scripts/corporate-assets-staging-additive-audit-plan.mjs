/**
 * Review-only additive repair plan for an existing isolated Assets staging D1.
 * NO Cloudflare connector, SQL runner, network access, secrets, or deployment.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 assessExistingAssetsStaging,ASSETS_ISOLATED_DB_ID
} from './corporate-assets-staging-offline-bootstrap-receipt.mjs';

const digest=x=>createHash('sha256').update(x).digest('hex');
const canonicalSource=new URL('../cloudflare/migrations/004_v56_audit_lineage.sql',import.meta.url);
function unique(source,re,label){
 const matches=[...source.matchAll(re)];
 if(matches.length!==1)throw Error('canonical_audit_sql_drift_'+label);
 return matches[0][0].trim();
}

/**
 * Only a missing integrity table on an otherwise complete existing schema
 * may be rehearsed. The audit failure and integrity indexes are additive.
 * Caller-supplied catalog is not authenticated; this is NOT release authority.
 */
export function buildAssetsAuditRepairReview({
 expectedMainSha,observedMainSha,metadata,catalog,read=readFileSync
}={}){
 const assessment=assessExistingAssetsStaging({expectedMainSha,observedMainSha,metadata,catalog,read});
 if(assessment.reason!=='existing_schema_incomplete'||
    assessment.missingRequiredTables.length!==1||
    assessment.missingRequiredTables[0]!=='audit_integrity_checks')
  throw Error('isolated_audit_only_repair_scope_required');
 if(!catalog?.objects.some(x=>x.type==='table'&&x.name==='audit_write_failures')||
    !catalog?.objects.some(x=>x.type==='table'&&x.name==='tenants'))
  throw Error('canonical_audit_dependencies_required');
 const canonical=read(canonicalSource,'utf8');
 const table=unique(canonical,/CREATE TABLE IF NOT EXISTS audit_integrity_checks\([\s\S]*?\n\);/g,
  'integrity_table');
 const failureIndex=unique(canonical,/CREATE INDEX IF NOT EXISTS audit_write_failures_tenant_idx[\s\S]*?;/g,
  'failure_index');
 const integrityIndex=unique(canonical,/CREATE INDEX IF NOT EXISTS audit_integrity_checks_tenant_idx[\s\S]*?;/g,
  'integrity_index');
 const sql=[table,failureIndex,integrityIndex].join('\n')+'\n';
 // ON DELETE CASCADE is a legitimate foreign-key clause, not a DELETE
 // statement. Reject executable mutation statements at statement boundaries.
 if(/(?:^|;)\s*(?:DROP|ALTER|DELETE|UPDATE|INSERT|TRUNCATE|REPLACE|ATTACH|DETACH)\b/im.test(sql))
  throw Error('additive_sql_not_safe');
 if((sql.match(/CREATE TABLE/g)||[]).length!==1||(sql.match(/CREATE INDEX/g)||[]).length!==2)
  throw Error('unexpected_additive_sql_shape');
 return Object.freeze({
  mode:'OFFLINE_ONLY_REVIEW_CANDIDATE',
  targetDatabaseId:ASSETS_ISOLATED_DB_ID,sourceSha:expectedMainSha,
  sql,sqlSha256:digest(sql),canonicalAuditMigrationSha256:digest(canonical),
  missingRequiredTables:assessment.missingRequiredTables,
  existingNonemptyTables:assessment.nonemptyTables,
  statements:3,remoteD1Executed:false,
  dataPreservedInCloudflareUnverified:true,
  ownerApprovalRequired:true,thusicoProtectedApprovalRequired:true,
  remoteWriteAuthorized:false,rollbackAuthorized:false,productionWriteAuthorized:false
 });
}
