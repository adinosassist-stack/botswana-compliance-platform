import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SIGNUP_STAGING_ORIGIN,SIGNUP_STAGING_PROFILE,signupStagingIdentity} from '../cloudflare/src/signup-conversion-staging-policy.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export function renderSignupStagingConfig(env){
  const {databaseId,sourceSha}=signupStagingIdentity(env);
  return {name:'bw-signup-conversion-staging',main:path.join(root,'cloudflare/src/signup-conversion-staging-entry.js'),compatibility_date:'2026-09-03',
    workers_dev:false,preview_urls:false,keep_vars:false,routes:[{pattern:new URL(SIGNUP_STAGING_ORIGIN).hostname,custom_domain:true}],
    vars:{APP_ENV:'staging',DEPLOYMENT_PROFILE:SIGNUP_STAGING_PROFILE,PUBLIC_ORIGIN:SIGNUP_STAGING_ORIGIN,PUBLIC_APP_URL:SIGNUP_STAGING_ORIGIN,SIGNUP_STAGING_SOURCE_SHA:sourceSha,
      ...Object.fromEntries(['SIGNUP_STAGING_D1_ID','PRODUCTION_D1_DATABASE_ID','BILLING_STAGING_D1_ID','REGULATORY_STAGING_D1_ID'].map(key=>[key,String(env[key]).toLowerCase()]))},
    secrets:{required:['SESSION_SECRET','AUDIT_INTEGRITY_SECRET']},
    d1_databases:[{binding:'DB',database_name:'bw-signup-conversion-staging',database_id:databaseId}],
    ratelimits:[{name:'PUBLIC_RATE_LIMITER',namespace_id:'78212159',simple:{limit:30,period:60}}],
    assets:{directory:path.join(root,'public'),binding:'ASSETS',run_worker_first:true,not_found_handling:'404-page'}};
}
export function signupStagingMarkerSql(env){
  const {databaseId}=signupStagingIdentity(env);
  return `CREATE TABLE signup_conversion_staging_identity(id INTEGER PRIMARY KEY CHECK(id=1),database_id TEXT NOT NULL,environment TEXT NOT NULL CHECK(environment='${SIGNUP_STAGING_PROFILE}'));\nINSERT INTO signup_conversion_staging_identity VALUES(1,'${databaseId}','${SIGNUP_STAGING_PROFILE}');\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.stdout.write(process.argv[2]==='--marker-sql'?signupStagingMarkerSql(process.env):JSON.stringify(renderSignupStagingConfig(process.env),null,2)+'\n')}
  catch(error){console.error(error.message);process.exitCode=1}
}
