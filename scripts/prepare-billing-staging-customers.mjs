import {randomBytes,randomUUID,pbkdf2Sync} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {validateBillingStagingOwnerConfiguration} from './prepare-billing-staging-owner.mjs';

const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const CUSTOMER_EMAILS=['alpha.billing-staging@example.invalid','beta.billing-staging@example.invalid'];
function hashPassword(password){
 if(typeof password!=='string'||password.length<12||password.length>200||!password.trim()||/[\r\n]/.test(password))throw Error('billing_staging_customer_password_length');
 const salt=randomBytes(16);
 return 'pbkdf2$100000$'+salt.toString('base64')+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64');
}

// Offline, insert-only preparation. The SQL guard permits only the known
// owner-only staging state; the authenticated operator applies one atomic D1 import.
export function prepareBillingStagingCustomers(options={}){
 const {ownerEmail,alphaPassword,betaPassword,expectedDatabaseId,sourceSha,config}=options;
 const selected=validateBillingStagingOwnerConfiguration({...options,email:ownerEmail});
 const admins=String(config.vars.PLATFORM_ADMIN_EMAILS).split(',').map(x=>x.trim().toLowerCase());
 if(CUSTOMER_EMAILS.some(email=>admins.includes(email)))throw Error('billing_staging_customer_must_not_be_admin');
 if(alphaPassword===betaPassword)throw Error('billing_staging_customer_passwords_must_differ');
 const hashes=[hashPassword(alphaPassword),hashPassword(betaPassword)];
 const customers=CUSTOMER_EMAILS.map((email,i)=>({email,key:i===0?'alpha':'beta',userId:randomUUID(),tenantId:randomUUID()}));
 const emptyTables=['payment_orders','payment_fulfillments','entitlement_overrides','platform_regulatory_principals'];
 const singletonTables=['users','tenants','memberships','app_state','subscriptions'];
 let sql=`-- Reviewed source: ${sourceSha}. Two isolated staging customers; no payments or paid access.
SELECT CASE WHEN
 EXISTS(SELECT 1 FROM billing_staging_identity WHERE id=1 AND database_id=${quote(expectedDatabaseId)} AND environment='billing-staging')
 ${singletonTables.map(t=>`AND (SELECT COUNT(*) FROM ${t})=1`).join('\n ')}
 ${emptyTables.map(t=>`AND NOT EXISTS(SELECT 1 FROM ${t})`).join('\n ')}
 AND EXISTS(SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id JOIN subscriptions s ON s.tenant_id=m.tenant_id JOIN app_state a ON a.tenant_id=m.tenant_id
 WHERE lower(u.email)=${quote(selected)} AND m.role='owner' AND m.status='active' AND s.status='inactive' AND s.provider='manual_bank')
 THEN 1 ELSE abs(-9223372036854775808) END AS billing_staging_customer_guard;
`;
 for(const [i,c] of customers.entries()){
  sql+=`INSERT INTO tenants(id,name) VALUES(${quote(c.tenantId)},${quote('Billing staging customer '+c.key)});
INSERT INTO users(id,email,display_name,password_hash,onboarding_complete) VALUES(${quote(c.userId)},${quote(c.email)},${quote('Staging customer '+c.key)},${quote(hashes[i])},1);
INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(${quote(c.tenantId)},${quote(c.userId)},'owner','active');
INSERT INTO app_state(tenant_id,version,state_json) VALUES(${quote(c.tenantId)},1,${quote(JSON.stringify({billingStagingFixture:c.key}))});
INSERT INTO subscriptions(tenant_id,plan,status,provider) VALUES(${quote(c.tenantId)},'business','inactive','manual_bank');
`;
 }
 return {sql,customers};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const {values}=parseArgs({options:{config:{type:'string'},'owner-email':{type:'string'},database:{type:'string'},out:{type:'string'}}});
  if(!values.config||!values['owner-email']||!values.database||!values.out)throw Error('billing_staging_customer_arguments_required');
  const passwords=readFileSync(0,'utf8').split('\n');
  if(passwords.length!==2)throw Error('billing_staging_customer_two_passwords_required');
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'}).trim();
  const prepared=prepareBillingStagingCustomers({config:JSON.parse(readFileSync(values.config,'utf8')),ownerEmail:values['owner-email'],alphaPassword:passwords[0],betaPassword:passwords[1],expectedDatabaseId:values.database,productionDatabaseId:process.env.PRODUCTION_D1_DATABASE_ID,sourceSha});
  writeFileSync(values.out,prepared.sql,{mode:0o600,flag:'wx'});
  console.log('Prepared private staging-customer SQL. No database write was performed.');
 }catch(error){
  console.error(/^billing_staging_[a-z_]+$/.test(String(error?.message||''))?error.message:'billing_staging_customer_prepare_failed');process.exitCode=1;
 }
}
