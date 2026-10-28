import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,statSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {prepareBillingStagingPayments} from '../scripts/prepare-billing-staging-payments.mjs';
import {prepareBillingStagingOwner} from '../scripts/prepare-billing-staging-owner.mjs';
import {prepareBillingStagingCustomers} from '../scripts/prepare-billing-staging-customers.mjs';
import {renderBillingStagingConfig,billingStagingMarkerSql} from '../scripts/render-billing-staging-config.mjs';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import staging from '../cloudflare/src/billing-staging-entry.js';

const inputs={BILLING_STAGING_D1_ID:'11111111-1111-4111-8111-111111111111',PRODUCTION_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',BILLING_STAGING_SOURCE_SHA:'a'.repeat(40),BILLING_STAGING_ADMIN_EMAILS:'thebedesk@gmail.com'};
const config=renderBillingStagingConfig(inputs);
const args={config,expectedDatabaseId:inputs.BILLING_STAGING_D1_ID,productionDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID,sourceSha:inputs.BILLING_STAGING_SOURCE_SHA,ownerEmail:inputs.BILLING_STAGING_ADMIN_EMAILS};
const passwords={owner:'Owner-staging-test-password!',alpha:'Alpha-staging-test-password!',beta:'Beta-staging-test-password!'};
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('cloudflare/schema.sql','utf8'));db.exec(billingStagingMarkerSql(inputs));
 const owner=prepareBillingStagingOwner({...args,email:args.ownerEmail,password:passwords.owner});db.exec(owner.sql);
 const customers=prepareBillingStagingCustomers({...args,alphaPassword:passwords.alpha,betaPassword:passwords.beta});db.exec(customers.sql);
 return {db,owner,customers:customers.customers};
}
const snapshot=db=>JSON.stringify(Object.fromEntries(['users','tenants','memberships','app_state','subscriptions','payment_orders','manual_payment_submissions','manual_payment_events','payment_fulfillments','entitlement_overrides','platform_regulatory_principals'].map(t=>[t,db.prepare('SELECT * FROM '+t).all()])));

test('preparation creates only labelled pending fixtures, preserving identities and inactive subscriptions',()=>{
 const f=fixture();try{
  const before=JSON.stringify(f.db.prepare('SELECT * FROM users').all());const subs=JSON.stringify(f.db.prepare('SELECT * FROM subscriptions').all());
  const prepared=prepareBillingStagingPayments(args);assert.equal(f.db.prepare('SELECT count(*) n FROM payment_orders').get().n,0);f.db.exec(prepared.sql);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM users').all()),before);assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM subscriptions').all()),subs);
  const orders=f.db.prepare('SELECT * FROM payment_orders ORDER BY id').all();assert.equal(orders.length,2);
  for(const order of orders){assert.equal(order.status,'pending');assert.equal(order.paid_at,null);assert.equal(order.provider_payment_id,null);assert.equal(order.amount_bwp,349);assert.equal(JSON.parse(order.metadata_json).synthetic,true)}
  assert.equal(f.db.prepare("SELECT count(*) n FROM manual_payment_submissions WHERE status='submitted' AND bank_reference LIKE 'STAGING-TEST-NO-FUNDS-%'").get().n,2);
  assert.equal(f.db.prepare("SELECT count(*) n FROM manual_payment_events WHERE event_type='staging_fixture_created'").get().n,2);
  for(const table of ['payment_fulfillments','entitlement_overrides','platform_regulatory_principals'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
  const state=snapshot(f.db);assert.throws(()=>f.db.exec(prepared.sql),/integer overflow/);assert.equal(snapshot(f.db),state);
 }finally{f.db.close()}
});
for(const mutation of [
 'DELETE FROM billing_staging_identity',"UPDATE billing_staging_identity SET database_id='wrong'",
 "UPDATE users SET email='unexpected@example.invalid' WHERE email='thebedesk@gmail.com'",
 "UPDATE app_state SET state_json='{}' WHERE json_extract(state_json,'$.billingStagingFixture')='beta'",
 "UPDATE memberships SET role='manager'", "UPDATE subscriptions SET status='active'",
 "UPDATE subscriptions SET current_period_ends_at='2099-01-01'",
 "INSERT INTO tenants(id,name) VALUES('unexpected','Unexpected')",
 "INSERT INTO payment_orders(id,tenant_id,order_type,amount_bwp,idempotency_key) SELECT 'existing',id,'subscription',1,'existing' FROM tenants LIMIT 1"
])test('payment fixture guard rejects changed baseline: '+mutation,()=>{
 const f=fixture();try{const p=prepareBillingStagingPayments(args);f.db.exec(mutation);const before=snapshot(f.db);assert.throws(()=>f.db.exec(p.sql),/integer overflow/);assert.equal(snapshot(f.db),before)}finally{f.db.close()}
});
for(const patch of [{sourceSha:'b'.repeat(40)},{expectedDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID},{ownerEmail:'someone@example.invalid'},{config:{...config,vars:{...config.vars,POP_UPLOAD_STAGING_ENABLED:'true'}}}])test('payment fixture preparation refuses invalid authority '+Object.keys(patch),()=>assert.throws(()=>prepareBillingStagingPayments({...args,...patch}),/billing_staging_/));

test('actual staging owner queue and analytics expose pending fixtures while each customer sees only its own order',async()=>{
 const f=fixture();try{
  const prepared=prepareBillingStagingPayments(args);f.db.exec(prepared.sql);
  const DB={prepare(sql){let values=[];return {bind(...p){values=p;return this},async first(){return f.db.prepare(sql).get(...values)||null},async all(){return {results:f.db.prepare(sql).all(...values)}},async run(){return {meta:{changes:Number(f.db.prepare(sql).run(...values).changes)}}}}}};
  const env={...config.vars,DB,SESSION_SECRET:'pending-fixtures-session-secret-'.repeat(3)};
  const send=(path,options={})=>staging.fetch(new Request(config.vars.PUBLIC_ORIGIN+path,options),env,{});
  const login=async(email,password)=>{
   const r=await send('/api/auth/login',{method:'POST',headers:{origin:config.vars.PUBLIC_ORIGIN,'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];
  };
  const ownerCookie=await login(args.ownerEmail,passwords.owner);
  const queue=await send('/api/platform/billing/manual-payments',{headers:{cookie:ownerCookie}});assert.equal(queue.status,200);const body=await queue.json();assert.equal(body.total,2);assert.equal(body.items.length,2);assert.ok(body.items.every(i=>i.metadata.synthetic===true));
  const analytics=await send('/api/platform/billing/analytics',{headers:{cookie:ownerCookie}});assert.equal(analytics.status,200);const a=await analytics.json();assert.equal(a.pending.count,2);assert.equal(a.pending.amountBwp,698);assert.equal(a.totalReceiptsBwp,0);assert.equal(a.status.inactive,3);
  for(const [i,c] of f.customers.entries()){
   const cookie=await login(c.email,passwords[c.key]);const other=f.customers[1-i];
   for(const path of ['/api/payments/orders','/api/payments/manual-bank/status']){
    const query='tenantId='+other.tenantId;
    for(const transport of [path+'?'+query,'/__thebe_api/'+path.slice(5)+'?'+query,'/?__thebe_api_path='+encodeURIComponent(path)+'&__thebe_api_query='+encodeURIComponent(query)]){
     const res=await send(transport,{headers:{cookie,'x-tenant-id':other.tenantId}});assert.equal(res.status,200);const items=(await res.json()).items;assert.equal(items.length,1);assert.equal(path.includes('/orders')?items[0].id:items[0].payment_order_id,prepared.fixtures[i].orderId);
    }
   }
   const forbidden=await send('/api/platform/billing/manual-payments',{headers:{cookie}});assert.equal(forbidden.status,403);
  }
  const before=snapshot(f.db);
  for(const p of prepared.fixtures){const res=await send('/api/platform/billing/manual-payments/'+p.submissionId+'/approve',{method:'POST',headers:{origin:config.vars.PUBLIC_ORIGIN,cookie:ownerCookie,'content-type':'application/json'},body:JSON.stringify({bankFundsConfirmed:true,bankAmountMatched:true,bankTransactionMatched:true})});assert.equal(res.status,403);assert.equal((await res.json()).error,'billing_staging_mutations_disabled')}
  assert.equal(snapshot(f.db),before);
 }finally{f.db.close()}
});

test('CLI creates private SQL exclusively without provider access',()=>{
 const dir=mkdtempSync(join(tmpdir(),'billing-payment-fixture-'));try{
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const configPath=join(dir,'config.json'),out=join(dir,'fixtures.sql');writeFileSync(configPath,JSON.stringify(renderBillingStagingConfig({...inputs,BILLING_STAGING_SOURCE_SHA:sourceSha})));
  const argv=['scripts/prepare-billing-staging-payments.mjs','--config',configPath,'--owner-email',args.ownerEmail,'--database',args.expectedDatabaseId,'--out',out];
  const opts={encoding:'utf8',env:{...process.env,PRODUCTION_D1_DATABASE_ID:inputs.PRODUCTION_D1_DATABASE_ID}};const res=spawnSync(process.execPath,argv,opts);assert.equal(res.status,0,res.stderr);assert.equal(statSync(out).mode&0o777,0o600);const before=readFileSync(out,'utf8');assert.equal(spawnSync(process.execPath,argv,opts).status,1);assert.equal(readFileSync(out,'utf8'),before);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('local D1 rolls back both orders and submission history when the second event fails',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'billing-staging-pending-fixtures'}}));
 try{
  const DB=await mf.getD1Database('DB');const baseline=readFileSync('cloudflare/schema.sql','utf8');
  for(const table of ['tenants','users','memberships','app_state','subscriptions','payment_orders','payment_fulfillments','entitlement_overrides','platform_regulatory_principals','manual_payment_submissions','manual_payment_events','payment_events'])await DB.prepare(baseline.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\([\\s\\S]*?\\);'))[0]).run();
  for(const sql of [billingStagingMarkerSql(inputs),prepareBillingStagingOwner({...args,email:args.ownerEmail,password:passwords.owner}).sql,prepareBillingStagingCustomers({...args,alphaPassword:passwords.alpha,betaPassword:passwords.beta}).sql])await DB.batch(splitSqliteMigrationStatements(sql).map(s=>DB.prepare(s)));
  const prepared=prepareBillingStagingPayments(args);
  await DB.prepare(`CREATE TRIGGER refuse_second_event BEFORE INSERT ON manual_payment_events WHEN NEW.payment_order_id='${prepared.fixtures[1].orderId}' BEGIN SELECT RAISE(ABORT,'fixture second event failure'); END`).run();
  await assert.rejects(DB.batch(splitSqliteMigrationStatements(prepared.sql).map(s=>DB.prepare(s))),/fixture second event failure/);
  for(const t of ['payment_orders','manual_payment_submissions','manual_payment_events'])assert.equal((await DB.prepare('SELECT count(*) n FROM '+t).first()).n,0);
  await DB.prepare('DROP TRIGGER refuse_second_event').run();await DB.batch(splitSqliteMigrationStatements(prepared.sql).map(s=>DB.prepare(s)));
  await assert.rejects(DB.batch(splitSqliteMigrationStatements(prepared.sql).map(s=>DB.prepare(s))),/integer overflow/);assert.equal((await DB.prepare('SELECT count(*) n FROM payment_orders').first()).n,2);
 }finally{await mf.dispose()}
});
