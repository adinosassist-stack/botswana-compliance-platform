import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{40}$/;
const FORBIDDEN_DATABASES=new Set([
 '8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce', // production
 '20c0d37e-552e-438f-a56d-3f12c27d38e2', // regulatory staging
 '812f9021-890b-41e6-8fa1-6001f90a9b53', // POP staging
 '9d1b8852-4424-46e9-ba24-cdad5ced215f', // billing staging
 '95c48030-0395-44cb-aa95-622beaf4efdf' // conversation staging
]);
export const ASSETS_STAGING_DATABASE='bw-corporate-assets-staging';
export const ASSETS_STAGING_WORKER='bw-corporate-assets-staging';
// Configuration generator only; never auto-deploys or connects a production route.
export function renderCorporateAssetsStagingConfig(env){
 const databaseId=String(env.ASSETS_STAGING_D1_ID||'').toLowerCase();
 const productionId=String(env.PRODUCTION_D1_DATABASE_ID||'').toLowerCase();
 const sourceSha=String(env.ASSETS_STAGING_SOURCE_SHA||'').toLowerCase();
 if(!UUID.test(databaseId)||!UUID.test(productionId)||databaseId===productionId||FORBIDDEN_DATABASES.has(databaseId))throw Error('assets_staging_isolated_d1_required');
 if(!SHA.test(sourceSha))throw Error('assets_staging_exact_source_sha_required');
 return {
  name:ASSETS_STAGING_WORKER,main:path.join(root,'cloudflare/src/corporate-assets-staging-entry.js'),compatibility_date:'2026-09-03',
  workers_dev:false,preview_urls:false,keep_vars:false,routes:[],
  vars:{APP_ENV:'staging',DEPLOYMENT_PROFILE:'corporate-assets-isolated',ASSETS_STAGING_SOURCE_SHA:sourceSha,ASSETS_STAGING_D1_ID:databaseId,
   THEBE_CORPORATE_ASSETS_ENABLED:'false',ASSETS_STAGING_WRITES_ENABLED:'false',REGISTRATION_MODE:'hold',PAYMENT_PROVIDER:'none',
   EVIDENCE_UPLOADS_ENABLED:'false',POP_UPLOAD_STAGING_ENABLED:'false',THEBE_AI_EXPORTS_ENABLED:'false',
   THEBE_GENERAL_AI_ENABLED:'false',THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false'},
  d1_databases:[{binding:'DB',database_name:ASSETS_STAGING_DATABASE,database_id:databaseId}]
 };
}
export function corporateAssetsStagingMarkerSql(env){
 const c=renderCorporateAssetsStagingConfig(env);
 return `CREATE TABLE IF NOT EXISTS corporate_assets_staging_identity(id INTEGER PRIMARY KEY CHECK(id=1),database_id TEXT NOT NULL,environment TEXT NOT NULL CHECK(environment='corporate-assets-isolated'));\nINSERT INTO corporate_assets_staging_identity(id,database_id,environment) VALUES(1,'${c.vars.ASSETS_STAGING_D1_ID}','corporate-assets-isolated') ON CONFLICT(id) DO UPDATE SET database_id=excluded.database_id,environment=excluded.environment;\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(process.argv[2]==='--marker-sql'?corporateAssetsStagingMarkerSql(process.env):JSON.stringify(renderCorporateAssetsStagingConfig(process.env),null,2)+'\\n')}
 catch(e){console.error(e.message);process.exitCode=1}
}
