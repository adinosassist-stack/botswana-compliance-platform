/** Review-only acceptance gate for isolated export D1 schema migration.
 * No Cloudflare API, remote SQL, process spawning or database writes.
 * All approval records are treated as untrusted inputs and independently
 * authenticated provenance MUST be verified by the future protected runner.
 */
import {candidateSha256,qualifyExportSchemaPlan} from './qualify-ai-export-staging-schema-offline.mjs';
const TARGET='ee6ddc6b-9de7-43f5-97e8-39442f1d1135';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const validSha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=reason=>Object.freeze({ok:false,reason,approvedToApply:false,productionReady:false,remoteMutations:0});
export function inspectExportStagingPreapply({sourceSha,reviewManifest,ddl,inventory,ownerApproval,reviewerApproval,now}={}){
 if(!validSha(sourceSha)||!reviewManifest||reviewManifest.sourceSha!==sourceSha ||
    reviewManifest.stagingAccountId!==ACCOUNT||reviewManifest.stagingDatabaseId!==TARGET ||
    !validHash(reviewManifest.schemaSha256)||candidateSha256(ddl)!==reviewManifest.schemaSha256)
  return fail('source_or_schema_mismatch');
 try{qualifyExportSchemaPlan({accountId:ACCOUNT,databaseId:TARGET,appEnv:'staging',
   ddl,expectedSha256:reviewManifest.schemaSha256});}
 catch{return fail('candidate_ddl_unqualified')}
 // Live inventory evidence can only support a hold/plan; it is not an attestation
 // of where a subsequent execution would run.
 if(inventory?.accountId!==ACCOUNT||inventory?.databaseId!==TARGET ||
    inventory.changedDb!==false||inventory.rowsWritten!==0 ||
    !Array.isArray(inventory.applicationObjects)||inventory.applicationObjects.length!==0)
  return fail('isolated_target_not_verified_empty');
 const approvals=[ownerApproval,reviewerApproval];
 if(!Number.isSafeInteger(now)||now<=0 || approvals.some(a=>!a || a.sourceSha!==sourceSha ||
    a.schemaSha256!==reviewManifest.schemaSha256 ||
    a.accountId!==ACCOUNT||a.databaseId!==TARGET||
    a.scope!=='ISOLATED_AI_EXPORT_STAGING_SCHEMA_ONLY'||
    !Number.isSafeInteger(a.expiresAt)||a.expiresAt<=now||a.expiresAt>now+7*24*3600000))
  return fail('separate_exact_scope_approvals_missing_or_stale');
 if(ownerApproval.role!=='owner'||reviewerApproval.role!=='independent_reviewer'||
    reviewerApproval.author!=='thusico'||!ownerApproval.author||
    ownerApproval.author===reviewerApproval.author ||
    ownerApproval.recordId===reviewerApproval.recordId)
  return fail('independent_authority_not_verified');
 // Approval data alone cannot authenticate authors or establish environment
 // reviewer restrictions, live Cloudflare secret scope, or rollback readiness.
 // This candidate intentionally NEVER authorizes a D1 mutation.
 return Object.freeze({ok:true,reason:'local_inputs_structurally_qualified_external_authentication_required',
    stagingDatabaseId:TARGET,sourceSha,schemaSha256:reviewManifest.schemaSha256,
    approvedToApply:false,productionReady:false,remoteMutations:0,
    requiresAuthenticatedGithubApprovalProvenance:true,
    requiresProtectedStagingEnvironment:true,
    requiresLeastPrivilegeCredentials:true,
    requiresRollbackEvidence:true});
}
