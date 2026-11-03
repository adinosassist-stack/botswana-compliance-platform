import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {validateBillingStagingOwnerConfiguration} from './prepare-billing-staging-owner.mjs';
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";

// Offline SQL only. These synthetic pending orders are not bank receipt evidence.
export function prepareBillingStagingPayments(options={}){
 const {config,expectedDatabaseId,sourceSha,ownerEmail}=options;
 const owner=validateBillingStagingOwnerConfiguration({...options,email:ownerEmail});
 const fixtures=['alpha','beta'].map(key=>({key,email:key+'.billing-staging@example.invalid',orderId:randomUUID(),submissionId:randomUUID(),eventId:randomUUID()}));
 const admins=String(config.vars.PLATFORM_ADMIN_EMAILS).split(',').map(s=>s.trim().toLowerCase());
 if(fixtures.some(f=>admins.includes(f.email)))throw Error('billing_staging_customer_must_not_be_admin');
 const tenantFor=email=>`(SELECT m.tenant_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE lower(u.email)=${quote(email)})`;
 const ownerId=`(SELECT id FROM users WHERE lower(email)=${quote(owner)})`;
 const emptyTables=['payment_orders','manual_payment_submissions','manual_payment_events','payment_events','payment_fulfillments','entitlement_overrides','platform_regulatory_principals'];
 const scopeChecks=[{email:owner},...fixtures].map(f=>`AND EXISTS(SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id JOIN subscriptions s ON s.tenant_id=m.tenant_id JOIN app_state a ON a.tenant_id=m.tenant_id WHERE lower(u.email)=${quote(f.email)} AND m.role='owner' AND m.status='active' AND s.status='inactive' AND s.provider='manual_bank' AND s.current_period_ends_at IS NULL${f.key?` AND json_extract(a.state_json,'$.billingStagingFixture')=${quote(f.key)}`:''})`).join('\n ');
 let sql=`-- Reviewed source: ${sourceSha}. SYNTHETIC pending fixtures. NO FUNDS RECEIVED; NEVER APPROVE.
SELECT CASE WHEN
 EXISTS(SELECT 1 FROM billing_staging_identity WHERE id=1 AND database_id=${quote(expectedDatabaseId)} AND environment='billing-staging')
 ${['users','tenants','memberships','app_state','subscriptions'].map(t=>`AND (SELECT COUNT(*) FROM ${t})=3`).join('\n ')}
 AND (SELECT COUNT(DISTINCT tenant_id) FROM memberships)=3
 ${emptyTables.map(t=>`AND NOT EXISTS(SELECT 1 FROM ${t})`).join('\n ')}
 ${scopeChecks}
 THEN 1 ELSE abs(-9223372036854775808) END AS billing_staging_payment_fixture_guard;
`;
 for(const f of fixtures){
  const tenant=tenantFor(f.email);
  const metadata=JSON.stringify({synthetic:true,stagingFixture:f.key,sourceSha,plan:'business',billingCycle:'monthly',periodMonths:1,paymentMode:'manual_bank',notice:'SYNTHETIC TEST ONLY - NO FUNDS RECEIVED - NEVER APPROVE'});
  sql+=`INSERT INTO payment_orders(id,tenant_id,order_type,provider,amount_bwp,status,idempotency_key,metadata_json) VALUES(${quote(f.orderId)},${tenant},'subscription','manual_bank',349,'pending',${quote('billing-staging-fixture-'+f.orderId)},${quote(metadata)});
INSERT INTO manual_payment_submissions(id,payment_order_id,tenant_id,bank_reference,status) VALUES(${quote(f.submissionId)},${quote(f.orderId)},${tenant},${quote('STAGING-TEST-NO-FUNDS-'+f.key.toUpperCase()+'-'+f.orderId)},'submitted');
INSERT INTO manual_payment_events(id,submission_id,payment_order_id,tenant_id,event_type,actor_user_id,event_data) VALUES(${quote(f.eventId)},${quote(f.submissionId)},${quote(f.orderId)},${tenant},'staging_fixture_created',${ownerId},${quote(JSON.stringify({synthetic:true,sourceSha,fixture:f.key,bankFundsConfirmed:false}))});
`;
 }
 return {sql,fixtures};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const {values}=parseArgs({options:{config:{type:'string'},'owner-email':{type:'string'},database:{type:'string'},out:{type:'string'}}});
  if(!values.config||!values['owner-email']||!values.database||!values.out)throw Error('billing_staging_payment_arguments_required');
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'}).trim();
  const prepared=prepareBillingStagingPayments({config:JSON.parse(readFileSync(values.config,'utf8')),ownerEmail:values['owner-email'],expectedDatabaseId:values.database,productionDatabaseId:process.env.PRODUCTION_D1_DATABASE_ID,sourceSha});
  writeFileSync(values.out,prepared.sql,{mode:0o600,flag:'wx'});
  console.log('Prepared synthetic pending-payment SQL. No database write or bank confirmation was performed.');
 }catch(error){console.error(/^billing_staging_[a-z_]+$/.test(String(error?.message||''))?error.message:'billing_staging_payment_prepare_failed');process.exitCode=1}
}
