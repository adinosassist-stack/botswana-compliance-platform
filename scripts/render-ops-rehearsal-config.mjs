// Offline configuration only. Does not deploy, initialize schema or attest isolation.
import {fileURLToPath,pathToFileURL} from 'node:url';
import {
 OPS_REHEARSAL_WORKER,OPS_REHEARSAL_D1_ID,OPS_REHEARSAL_RESTORE_D1_ID,
 OPS_REHEARSAL_BUCKET,OPS_REHEARSAL_PROFILE
} from '../cloudflare/src/ops-rehearsal-entry.js';

export function renderOpsRehearsalConfig(env={}){
 const account=String(env.CLOUDFLARE_ACCOUNT_ID||'');
 const databaseId=String(env.OPS_WORKER_D1_ID||'').trim().toLowerCase();
 const restoreId=String(env.OPS_RESTORE_D1_ID||OPS_REHEARSAL_RESTORE_D1_ID).trim().toLowerCase();
 const sourceSha=String(env.OPS_REHEARSAL_SOURCE_SHA||'');
 if(!/^[a-f0-9]{32}$/i.test(account))throw Error('ops_rehearsal_account_required');
 if(databaseId!==OPS_REHEARSAL_D1_ID||restoreId!==OPS_REHEARSAL_RESTORE_D1_ID||databaseId===restoreId)
  throw Error('ops_rehearsal_verified_database_required');
 if(!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('ops_rehearsal_exact_sha_required');
 return {
  name:OPS_REHEARSAL_WORKER,account_id:account,
  main:fileURLToPath(new URL('../cloudflare/src/ops-rehearsal-entry.js',import.meta.url)),
  compatibility_date:'2026-09-03',workers_dev:false,preview_urls:false,keep_vars:false,routes:[],
  triggers:{crons:[]},
  vars:{APP_ENV:'rehearsal',DEPLOYMENT_PROFILE:OPS_REHEARSAL_PROFILE,
   OPS_REHEARSAL_SOURCE_SHA:sourceSha,REHEARSAL_APP_D1_ID:databaseId,
   REGISTRATION_MODE:'hold',PAYMENT_PROVIDER:'none',EVIDENCE_UPLOADS_ENABLED:'false',
   POP_UPLOAD_STAGING_ENABLED:'false',AI_FEATURES_DEFAULT:'off',THEBE_INTERNAL_AUTONOMY_ENABLED:'false',
   AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',THEBE_LIVE_VOICE_ENABLED:'false',
   THEBE_GPT_LIVE_PREVIEW_ENABLED:'false',THEBE_MARKETING_VOICE_ENABLED:'false'},
  d1_databases:[{binding:'DB',database_name:OPS_REHEARSAL_WORKER,database_id:databaseId}],
  r2_buckets:[{binding:'EVIDENCE',bucket_name:OPS_REHEARSAL_BUCKET}]
 };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(JSON.stringify(renderOpsRehearsalConfig(process.env),null,2)+'\n')}
 catch(error){console.error(error.message);process.exitCode=1}
}
