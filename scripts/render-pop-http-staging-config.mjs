import {fileURLToPath,pathToFileURL} from 'node:url';
const DATABASE='812f9021-890b-41e6-8fa1-6001f90a9b53';
export const POP_HTTP_STAGING_BUCKET='bw-pop-http-staging-quarantine';
export function renderPopHttpStagingConfig({sourceSha,adminEmails}={}){
 if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('pop_staging_exact_source_required');
 if(typeof adminEmails!=='string'||adminEmails.length>1000)throw Error('pop_staging_admin_required');
 const emails=[...new Set(adminEmails.split(',').map(x=>x.trim().toLowerCase()))];
 if(!emails.length||emails.some(x=>!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(x)))throw Error('pop_staging_admin_required');
 return {name:'bw-pop-http-staging',main:fileURLToPath(new URL('../cloudflare/src/payment-pop-http-staging-entry.js',import.meta.url)),compatibility_date:'2026-09-03',
  workers_dev:false,preview_urls:false,keep_vars:false,
  d1_databases:[{binding:'DB',database_name:'bw-compliance-os-pop-staging',database_id:DATABASE}],
  r2_buckets:[{binding:'EVIDENCE',bucket_name:POP_HTTP_STAGING_BUCKET}],
  vars:{APP_ENV:'staging',DEPLOYMENT_PROFILE:'pop-http-staging',PUBLIC_ORIGIN:'https://pop-staging.thebedesk.com',PUBLIC_APP_URL:'https://pop-staging.thebedesk.com',
   POP_HTTP_STAGING_D1_ID:DATABASE,POP_HTTP_STAGING_SOURCE_SHA:sourceSha,PLATFORM_ADMIN_EMAILS:emails.join(','),
   ...Object.fromEntries(['POP_HTTP_STAGING_ENABLED','POP_UPLOAD_STAGING_ENABLED','POP_SCAN_STAGING_ENABLED','POP_SCAN_TRANSPORT_STAGING_ENABLED','POP_OWNER_RETRIEVAL_STAGING_ENABLED','POP_RETENTION_STAGING_ENABLED','POP_RECOVERY_STAGING_ENABLED','THEBE_GENERAL_AI_ENABLED','THEBE_AI_EXPORTS_ENABLED','THEBE_LIVE_VOICE_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED'].map(x=>[x,'false'])),
   REGISTRATION_MODE:'hold',PAYMENT_PROVIDER:'none',AI_FEATURES_DEFAULT:'off',AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0'},
  secrets:{required:['SESSION_SECRET','AUDIT_INTEGRITY_SECRET']}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{
 process.stdout.write(JSON.stringify(renderPopHttpStagingConfig({sourceSha:process.env.EXPECTED_SHA,adminEmails:process.env.POP_STAGING_ADMIN_EMAILS}),null,2)+'\n');
}catch(error){console.error(error.message);process.exitCode=1}}
