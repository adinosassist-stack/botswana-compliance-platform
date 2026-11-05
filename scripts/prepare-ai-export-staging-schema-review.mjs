// Produce a reviewable, no-network AI-export D1 migration evidence manifest.
// This tool never queries Cloudflare and never executes the SQL.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {candidateSha256,qualifyExportSchemaPlan,schemaPath} from './qualify-ai-export-staging-schema-offline.mjs';

export function buildReviewManifest({sourceSha,ddl,accountId='ddd23cab31928a4bb3d4998df9b26d1d',databaseId='ee6ddc6b-9de7-43f5-97e8-39442f1d1135'}={}){
  if(typeof sourceSha!=='string'||!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('schema_review_invalid_source_sha');
  const digest=candidateSha256(ddl);
  const plan=qualifyExportSchemaPlan({appEnv:'staging',accountId,databaseId,ddl,expectedSha256:digest});
  if(plan.approvedToApply!==false||plan.remoteMutations!==0)throw Error('schema_review_mutation_guard');
  return Object.freeze({
    kind:'ai_export_staging_schema_review_evidence_v1',
    sourceSha,
    schemaSha256:digest,
    stagingAccountId:accountId,
    stagingDatabaseId:databaseId,
    schemaFile:'docs/ai-export-d1-schema-candidate.sql',
    expectedStatements:3,
    qualifiedForReview:true,
    approvedToApply:false,
    productionReady:false,
    schemaApplied:false,
    remoteQueriesPerformed:0,
    remoteMutationsPerformed:0,
    requiresIndependentReviewer:'thusico',
    requiresSeparateProtectedStagingMigrationAuthorization:true
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const sourceSha=process.env.GITHUB_SHA;
  const ddl=readFileSync(schemaPath,'utf8');
  const manifest=buildReviewManifest({sourceSha,ddl});
  const output=JSON.stringify(manifest,null,2)+'\n';
  const path=process.argv[2];
  if(path)writeFileSync(path,output,{flag:'wx',mode:0o600});
  else process.stdout.write(output);
}
