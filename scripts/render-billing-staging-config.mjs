import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const BILLING_STAGING_WORKER='bw-billing-staging';
export const BILLING_STAGING_DATABASE='bw-billing-staging';
export const BILLING_STAGING_BUCKET='bw-billing-staging-pop';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KNOWN_EXCLUDED_DATABASES=new Set(['8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','20c0d37e-552e-438f-a56d-3f12c27d38e2']);
const root=fileURLToPath(new URL('../',import.meta.url));

// Produces configuration only. Does not create resources, migrate, deploy or
// establish provider-side isolation. Metadata and private-bucket checks precede deployment.
export function renderBillingStagingConfig(env){
 const databaseId=String(env.BILLING_STAGING_D1_ID||'').toLowerCase();
 const productionId=String(env.PRODUCTION_D1_DATABASE_ID||'').toLowerCase();
 if(!UUID.test(databaseId)||!UUID.test(productionId))throw Error('billing_staging_database_identity_required');
 if(databaseId===productionId||KNOWN_EXCLUDED_DATABASES.has(databaseId))throw Error('billing_staging_database_forbidden');
 const sourceSha=String(env.BILLING_STAGING_SOURCE_SHA||'');
 if(!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('billing_staging_exact_sha_required');
 const emails=String(env.BILLING_STAGING_ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase());
 if(!emails.length||emails.some(s=>!(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)))||emails.includes('thebedesk@gmail.com'))throw Error('billing_staging_designated_admin_required');
 return {
  name:BILLING_STAGING_WORKER,main:path.join(root,'cloudflare/src/billing-staging-entry.js'),compatibility_date:'2026-09-03',
  workers_dev:false,preview_urls:false,keep_vars:false,
  routes:[{pattern:'billing-staging.thebedesk.com',custom_domain:true}],
  vars:{APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',BILLING_STAGING_SOURCE_SHA:sourceSha,BILLING_STAGING_D1_ID:databaseId,
   PUBLIC_APP_URL:'https://billing-staging.thebedesk.com',PUBLIC_ORIGIN:'https://billing-staging.thebedesk.com',
   PLATFORM_ADMIN_EMAILS:[...new Set(emails)].join(','),REGISTRATION_MODE:'hold',PAYMENT_PROVIDER:'none',
   EVIDENCE_UPLOADS_ENABLED:'false',POP_UPLOAD_STAGING_ENABLED:'false',AI_FEATURES_DEFAULT:'off',
   THEBE_INTERNAL_AUTONOMY_ENABLED:'false',AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',
   THEBE_LIVE_VOICE_ENABLED:'false',THEBE_GPT_LIVE_PREVIEW_ENABLED:'false',THEBE_MARKETING_VOICE_ENABLED:'false'},
  secrets:{required:['SESSION_SECRET','AUDIT_INTEGRITY_SECRET']},
  d1_databases:[{binding:'DB',database_name:BILLING_STAGING_DATABASE,database_id:databaseId}],
  r2_buckets:[{binding:'EVIDENCE',bucket_name:BILLING_STAGING_BUCKET}],
  assets:{directory:path.join(root,'public'),binding:'ASSETS',run_worker_first:true,not_found_handling:'404-page'}
 };
}

export function billingStagingMarkerSql(env){
 const c=renderBillingStagingConfig(env);
 return `CREATE TABLE billing_staging_identity(id INTEGER PRIMARY KEY CHECK(id=1),database_id TEXT NOT NULL,environment TEXT NOT NULL CHECK(environment='billing-staging'));\nINSERT INTO billing_staging_identity VALUES(1,'${c.vars.BILLING_STAGING_D1_ID}','billing-staging');\n`;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(process.argv[2]==='--marker-sql'?billingStagingMarkerSql(process.env):JSON.stringify(renderBillingStagingConfig(process.env),null,2)+'\n')}
 catch(error){console.error(error.message);process.exitCode=1}
}
