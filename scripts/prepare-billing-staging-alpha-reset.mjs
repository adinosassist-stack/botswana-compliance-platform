import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {validateBillingStagingOwnerConfiguration} from './prepare-billing-staging-owner.mjs';

const ALPHA='alpha.billing-staging@example.invalid';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const refuse=()=>{throw Error('billing_staging_alpha_reset_refused')};

// Offline SQL only. The operator must confirm the target's nonsecret tenant and
// session generation, then apply this whole file as one atomic D1 import.
export function prepareBillingStagingAlphaReset(options={}){
 const selected=validateBillingStagingOwnerConfiguration({...options,email:options.ownerEmail});
 const {config,tenantId,expectedGeneration,password,confirmation,expectedDatabaseId,sourceSha}=options;
 if(!UUID.test(String(tenantId||''))||!Number.isSafeInteger(expectedGeneration)||expectedGeneration<0||expectedGeneration>=2147483647)refuse();
 if(selected===ALPHA||String(config.vars.PLATFORM_ADMIN_EMAILS).split(',').map(x=>x.trim().toLowerCase()).includes(ALPHA))refuse();
 if(typeof password!=='string'||password.length<12||password.length>200||!password.trim()||/[\r\n]/.test(password)||password!==confirmation)throw Error('billing_staging_alpha_password_confirmation');
 const salt=randomBytes(16),hash='pbkdf2$100000$'+salt.toString('base64')+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64');
 const target=`SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id JOIN app_state a ON a.tenant_id=m.tenant_id JOIN subscriptions s ON s.tenant_id=m.tenant_id
 WHERE u.email=${quote(ALPHA)} AND m.tenant_id=${quote(tenantId)} AND m.role='owner' AND m.status='active'
 AND json_extract(a.state_json,'$.billingStagingFixture')='alpha' AND s.status='inactive' AND s.provider='manual_bank' AND s.current_period_ends_at IS NULL
 AND (SELECT COUNT(*) FROM memberships WHERE user_id=u.id)=1`;
 const sql=`-- Reviewed source ${sourceSha}. Explicit Alpha staging password reset only.
-- Apply the entire file atomically. A stale/replayed generation aborts all writes.
SELECT CASE WHEN
 EXISTS(SELECT 1 FROM billing_staging_identity WHERE id=1 AND database_id=${quote(expectedDatabaseId)} AND environment='billing-staging')
 AND (SELECT COUNT(*) FROM users WHERE id IN (${target}))=1
 AND EXISTS(SELECT 1 FROM users WHERE id IN (${target}) AND session_generation=${expectedGeneration})
 AND EXISTS(SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id WHERE lower(u.email)=${quote(selected)} AND m.role='owner' AND m.status='active' AND m.tenant_id!=${quote(tenantId)})
 AND NOT EXISTS(SELECT 1 FROM payment_orders WHERE tenant_id=${quote(tenantId)} AND (status!='pending' OR paid_at IS NOT NULL OR provider_payment_id IS NOT NULL))
 AND NOT EXISTS(SELECT 1 FROM payment_fulfillments WHERE tenant_id=${quote(tenantId)})
 AND NOT EXISTS(SELECT 1 FROM entitlement_overrides WHERE tenant_id=${quote(tenantId)})
 THEN 1 ELSE abs(-9223372036854775808) END AS billing_staging_alpha_reset_guard;
UPDATE users SET password_hash=${quote(hash)},session_generation=session_generation+1 WHERE id IN (${target}) AND session_generation=${expectedGeneration};
DELETE FROM sessions WHERE user_id IN (${target});
UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id IN (${target}) AND used_at IS NULL;
`;
 return {sql,nextGeneration:expectedGeneration+1};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const {values}=parseArgs({options:{config:{type:'string'},'owner-email':{type:'string'},database:{type:'string'},tenant:{type:'string'},generation:{type:'string'},out:{type:'string'}}});
  if(!values.config||!values['owner-email']||!values.database||!values.tenant||!/^\d+$/.test(values.generation||'')||!values.out)refuse();
  const lines=readFileSync(0,'utf8').split('\n');if(lines.length!==2)refuse();
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'}).trim();
  const result=prepareBillingStagingAlphaReset({config:JSON.parse(readFileSync(values.config,'utf8')),ownerEmail:values['owner-email'],expectedDatabaseId:values.database,productionDatabaseId:process.env.PRODUCTION_D1_DATABASE_ID,sourceSha,tenantId:values.tenant,expectedGeneration:Number(values.generation),password:lines[0],confirmation:lines[1]});
  writeFileSync(values.out,result.sql,{mode:0o600,flag:'wx'});
  console.log('Prepared private Alpha staging reset SQL. No database write was performed.');
 }catch(error){console.error(/^billing_staging_[a-z_]+$/.test(String(error?.message||''))?error.message:'billing_staging_alpha_reset_prepare_failed');process.exitCode=1}
}
