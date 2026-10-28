import {randomBytes,randomUUID,pbkdf2Sync} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {renderBillingStagingConfig} from './render-billing-staging-config.mjs';

const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const refuse=()=>{throw Error('billing_staging_owner_configuration_refused')};

// Offline SQL preparation only. The operator applies this private file through
// their authenticated CLI after independent review; no credentials are fetched.
export function validateBillingStagingOwnerConfiguration({config,email,expectedDatabaseId,productionDatabaseId,sourceSha}={}){
 if(!config?.vars||!Array.isArray(config.d1_databases)||config.d1_databases.length!==1||!Array.isArray(config.r2_buckets)||config.r2_buckets.length!==1)refuse();
 const expected=renderBillingStagingConfig({BILLING_STAGING_D1_ID:expectedDatabaseId,PRODUCTION_D1_DATABASE_ID:productionDatabaseId,BILLING_STAGING_SOURCE_SHA:sourceSha,BILLING_STAGING_ADMIN_EMAILS:email});
 const binding=config.d1_databases[0],bucket=config.r2_buckets[0];
 if(config.name!==expected.name||binding.binding!=='DB'||binding.database_name!=='bw-billing-staging'||binding.database_id!==expectedDatabaseId||bucket.binding!=='EVIDENCE'||bucket.bucket_name!=='bw-billing-staging-pop')refuse();
 for(const key of ['APP_ENV','DEPLOYMENT_PROFILE','PUBLIC_ORIGIN','PUBLIC_APP_URL','BILLING_STAGING_SOURCE_SHA','BILLING_STAGING_D1_ID','REGISTRATION_MODE','PAYMENT_PROVIDER','EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED'])if(config.vars[key]!==expected.vars[key])refuse();
 const selected=String(email).trim().toLowerCase();
 if(!String(config.vars.PLATFORM_ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).includes(selected))refuse();
 return selected;
}

export function prepareBillingStagingOwner(options={}){
 const {password,expectedDatabaseId,sourceSha}=options;
 const selected=validateBillingStagingOwnerConfiguration(options);
 if(typeof password!=='string'||password.length<12||password.length>200||!password.trim())throw Error('billing_staging_owner_password_length');
 const salt=randomBytes(16);
 const hash='pbkdf2$100000$'+salt.toString('base64')+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64');
 const userId=randomUUID(),tenantId=randomUUID();
 const sql=`-- Reviewed source: ${sourceSha}. Staging owner bootstrap, no paid entitlement.
SELECT CASE WHEN
 EXISTS(SELECT 1 FROM billing_staging_identity WHERE id=1 AND database_id=${quote(expectedDatabaseId)} AND environment='billing-staging')
 AND NOT EXISTS(SELECT 1 FROM users) AND NOT EXISTS(SELECT 1 FROM tenants) AND NOT EXISTS(SELECT 1 FROM payment_orders)
 THEN 1 ELSE abs(-9223372036854775808) END AS billing_staging_owner_guard;
INSERT INTO tenants(id,name) VALUES(${quote(tenantId)},'Billing staging owner');
INSERT INTO users(id,email,display_name,password_hash,onboarding_complete) VALUES(${quote(userId)},${quote(selected)},'Staging billing owner',${quote(hash)},1);
INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(${quote(tenantId)},${quote(userId)},'owner','active');
INSERT INTO app_state(tenant_id,version,state_json) VALUES(${quote(tenantId)},1,'{}');
INSERT INTO subscriptions(tenant_id,plan,status,provider) VALUES(${quote(tenantId)},'business','inactive','manual_bank');
`;
 return {sql,userId,tenantId};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const {values}=parseArgs({options:{config:{type:'string'},email:{type:'string'},database:{type:'string'},out:{type:'string'}}});
  if(!values.config||!values.email||!values.database||!values.out)throw Error('billing_staging_owner_arguments_required');
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'}).trim();
  const result=prepareBillingStagingOwner({config:JSON.parse(readFileSync(values.config,'utf8')),email:values.email,password:readFileSync(0,'utf8'),expectedDatabaseId:values.database,productionDatabaseId:process.env.PRODUCTION_D1_DATABASE_ID,sourceSha});
  writeFileSync(values.out,result.sql,{mode:0o600,flag:'wx'});
  console.log('Prepared a private staging-owner SQL file. No database write was performed.');
 }catch(error){
  const code=/^billing_staging_[a-z_]+$/.test(String(error?.message||''))?error.message:'billing_staging_owner_prepare_failed';
  console.error(code);process.exitCode=1;
 }
}
