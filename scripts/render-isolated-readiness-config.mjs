// Offline-only config. No deployment, schema initialization, credentials or public route.
import {fileURLToPath} from 'node:url';
const D1='c5c232a8-8fe7-440c-81ba-021a44fd3fdd';
const BUCKET='bw-compliance-ops-evidence';
const NAME='bw-compliance-os-readiness-staging';
export function renderIsolatedReadinessConfig({accountId,sourceSha}={}){
 if(!/^[a-f0-9]{32}$/i.test(String(accountId||'')))throw Error('readiness_account_id_required');
 if(!/^[a-f0-9]{40}$/.test(String(sourceSha||'')))throw Error('readiness_exact_sha_required');
 return {
  name:NAME,account_id:accountId,
  main:fileURLToPath(new URL('../cloudflare/src/release-governance-entry.js',import.meta.url)),
  compatibility_date:'2026-09-03',workers_dev:false,preview_urls:false,keep_vars:false,
  routes:[],triggers:{crons:[]},
  vars:{
   APP_ENV:'staging',DEPLOYMENT_PROFILE:'readiness-diagnostic-isolated',
   THEBE_READINESS_TIMING_DIAGNOSTIC:'1',
   READINESS_STAGING_SOURCE_SHA:sourceSha,
   REGISTRATION_MODE:'hold',PAYMENT_PROVIDER:'none',
   EVIDENCE_UPLOADS_ENABLED:'false',POP_UPLOAD_STAGING_ENABLED:'false',
   AI_FEATURES_DEFAULT:'off',THEBE_INTERNAL_AUTONOMY_ENABLED:'false',
   AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',THEBE_LIVE_VOICE_ENABLED:'false',
   THEBE_GPT_LIVE_PREVIEW_ENABLED:'false',THEBE_MARKETING_VOICE_ENABLED:'false'
  },
  d1_databases:[{binding:'DB',database_name:'bw-compliance-os-ops-rehearsal',database_id:D1}],
  r2_buckets:[{binding:'EVIDENCE',bucket_name:BUCKET}]
 };
}
