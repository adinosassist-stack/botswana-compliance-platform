import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,statSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {prepareBillingStagingCustomers} from '../scripts/prepare-billing-staging-customers.mjs';
import {prepareBillingStagingOwner} from '../scripts/prepare-billing-staging-owner.mjs';
import {renderBillingStagingConfig,billingStagingMarkerSql} from '../scripts/render-billing-staging-config.mjs';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import staging from '../cloudflare/src/billing-staging-entry.js';
import {__platformOwnerAccessTest} from '../cloudflare/src/platform-owner-access.js';

const inputs={BILLING_STAGING_D1_ID:'11111111-1111-4111-8111-111111111111',PRODUCTION_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',BILLING_STAGING_SOURCE_SHA:'a'.repeat(40),BILLING_STAGING_ADMIN_EMAILS:'thebedesk@gmail.com'};
const config=renderBillingStagingConfig(inputs);
const authority={config,expectedDatabaseId:inputs.BILLING_STAGING_D1_ID,productionDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID,sourceSha:inputs.BILLING_STAGING_SOURCE_SHA};
const args={...authority,ownerEmail:inputs.BILLING_STAGING_ADMIN_EMAILS,alphaPassword:'Alpha-staging-test-password!',betaPassword:'Beta-staging-test-password!'};
const ownerArgs={...authority,email:args.ownerEmail,password:'Owner-staging-test-password!'};
const counts=db=>Object.fromEntries(['users','tenants','memberships','app_state','subscriptions','payment_orders','payment_fulfillments','entitlement_overrides','platform_regulatory_principals'].map(t=>[t,db.prepare(`SELECT count(*) n FROM ${t}`).get().n]));
function fixture(){const db=new DatabaseSync(':memory:');db.exec(readFileSync('cloudflare/schema.sql','utf8'));db.exec(billingStagingMarkerSql(inputs));db.exec(prepareBillingStagingOwner(ownerArgs).sql);return db}

test('customer preparation adds exactly two independent inactive accounts and preserves the owner',async()=>{
 const db=fixture();try{
  const before=db.prepare('SELECT * FROM users').get();const prepared=prepareBillingStagingCustomers(args);
  assert.equal(counts(db).users,1);assert.ok(!prepared.sql.includes(args.alphaPassword));assert.ok(!prepared.sql.includes(args.betaPassword));
  db.exec(prepared.sql);
  assert.deepEqual(counts(db),{users:3,tenants:3,memberships:3,app_state:3,subscriptions:3,payment_orders:0,payment_fulfillments:0,entitlement_overrides:0,platform_regulatory_principals:0});
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=?').get(before.id),before);
  assert.equal(new Set(prepared.customers.map(c=>c.tenantId)).size,2);
  for(const [index,c] of prepared.customers.entries()){
   const user=db.prepare('SELECT * FROM users WHERE id=?').get(c.userId);assert.equal(user.email,c.email);
   assert.ok(await __platformOwnerAccessTest.verifyStoredPassword(index===0?args.alphaPassword:args.betaPassword,user.password_hash));
   assert.equal(await __platformOwnerAccessTest.verifyStoredPassword(index===0?args.betaPassword:args.alphaPassword,user.password_hash),false);
   assert.equal(db.prepare('SELECT status FROM subscriptions WHERE tenant_id=?').get(c.tenantId).status,'inactive');
  }
  const snapshot=counts(db);assert.throws(()=>db.exec(prepared.sql),/integer overflow/);assert.deepEqual(counts(db),snapshot);
 }finally{db.close()}
});
test('customer SQL refuses an empty database before owner provisioning',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec(readFileSync('cloudflare/schema.sql','utf8'));db.exec(billingStagingMarkerSql(inputs));
  assert.throws(()=>db.exec(prepareBillingStagingCustomers(args).sql),/integer overflow/);assert.equal(counts(db).users,0);
 }finally{db.close()}
});
for(const mutation of [
 'DELETE FROM billing_staging_identity',"UPDATE billing_staging_identity SET database_id='wrong'",
 "UPDATE users SET email='someone@example.invalid'","UPDATE memberships SET status='inactive'","UPDATE memberships SET role='manager'",
 "UPDATE subscriptions SET status='active'","INSERT INTO tenants(id,name) VALUES('unexpected','Unexpected')",
 "INSERT INTO payment_orders(id,tenant_id,order_type,amount_bwp,idempotency_key) SELECT 'unexpected',id,'subscription',1,'unexpected' FROM tenants LIMIT 1"
])test('customer SQL refuses changed staging precondition: '+mutation,()=>{
 const db=fixture();try{const prepared=prepareBillingStagingCustomers(args);db.exec(mutation);const before=counts(db);assert.throws(()=>db.exec(prepared.sql),/integer overflow/);assert.deepEqual(counts(db),before)}finally{db.close()}
});
for(const change of [{sourceSha:'b'.repeat(40)},{expectedDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID},{ownerEmail:'not-designated@example.invalid'},{alphaPassword:'short'},{betaPassword:args.alphaPassword},{alphaPassword:'contains\na-newline-password'},{config:{...config,vars:{...config.vars,POP_UPLOAD_STAGING_ENABLED:'true'}}},{config:renderBillingStagingConfig({...inputs,BILLING_STAGING_ADMIN_EMAILS:'alpha.billing-staging@example.invalid'}) ,ownerEmail:'alpha.billing-staging@example.invalid'}])test('customer preparation rejects invalid authority or credentials '+Object.keys(change).join(','),()=>{
 assert.throws(()=>prepareBillingStagingCustomers({...args,...change}),/billing_staging_/);
});

test('CLI consumes private stdin and refuses output overwrite without revealing credentials',()=>{
 const dir=mkdtempSync(join(tmpdir(),'billing-customers-'));try{
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const configPath=join(dir,'config.json'),out=join(dir,'customers.sql');
  writeFileSync(configPath,JSON.stringify(renderBillingStagingConfig({...inputs,BILLING_STAGING_SOURCE_SHA:sourceSha})));
  const cli=['scripts/prepare-billing-staging-customers.mjs','--config',configPath,'--owner-email',args.ownerEmail,'--database',args.expectedDatabaseId,'--out',out];
  const opts={encoding:'utf8',input:args.alphaPassword+'\n'+args.betaPassword,env:{...process.env,PRODUCTION_D1_DATABASE_ID:inputs.PRODUCTION_D1_DATABASE_ID}};
  const res=spawnSync(process.execPath,cli,opts);assert.equal(res.status,0,res.stderr);assert.equal(statSync(out).mode&0o777,0o600);
  for(const secret of [args.alphaPassword,args.betaPassword,'pbkdf2$'])assert.ok(!(res.stdout+res.stderr).includes(secret));
  const sql=readFileSync(out,'utf8');assert.equal(spawnSync(process.execPath,cli,opts).status,1);assert.equal(readFileSync(out,'utf8'),sql);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('generated customers authenticate separately through staging and cannot read platform billing',async()=>{
 const db=fixture();try{
  const prepared=prepareBillingStagingCustomers(args);db.exec(prepared.sql);
  const DB={prepare(sql){let values=[];return {bind(...p){values=p;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}}}}}};
  const env={...config.vars,DB,SESSION_SECRET:'customer-fixture-session-secret-'.repeat(3),ASSETS:{fetch:async()=>new Response(readFileSync('public/auth.html','utf8'),{headers:{'content-type':'text/html'}})}};
  for(const [i,c] of prepared.customers.entries()){
   const page=await staging.fetch(new Request(config.vars.PUBLIC_ORIGIN+'/auth/'),env,{});
   assert.equal(page.status,200);const html=await page.text();
   const mode=html.match(/<meta name="bw-runtime-mode" content="([^"]+)"/)?.[1];assert.equal(mode,'staging');
   let cookie='';const paths=[];
   const browser={URL,Headers,AbortController,crypto,setTimeout,clearTimeout,console,location:{href:config.vars.PUBLIC_ORIGIN+'/auth/',origin:config.vars.PUBLIC_ORIGIN,replace(){assert.fail('browser redirected away from staging')}},document:{querySelector:selector=>selector.includes('bw-runtime-mode')?{content:mode}:{}},fetch:async(target,options)=>{
    assert.equal(new URL(target).origin,config.vars.PUBLIC_ORIGIN);paths.push(new URL(target).searchParams.get('__thebe_api_path')||new URL(target).pathname);
    const headers=new Headers(options.headers);headers.set('origin',config.vars.PUBLIC_ORIGIN);
    const res=await staging.fetch(new Request(target,{...options,headers}),env,{});
    if(res.headers.has('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return res;
   }};
   browser.window=browser;vm.runInNewContext(readFileSync('public/js/api-client.js','utf8'),browser);
   const body=await browser.BW.api.createClient().request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:c.email,password:i===0?args.alphaPassword:args.betaPassword})});
   assert.equal(body.user.email,c.email);assert.ok(cookie);
   assert.deepEqual(paths,['/api/auth/register-transport-probe','/api/auth/login']);
   const me=await staging.fetch(new Request(config.vars.PUBLIC_ORIGIN+'/api/auth/me',{headers:{cookie}}),env,{});
   assert.equal(me.status,200);assert.equal((await me.json()).user.platformBillingAdmin,false);
   const state=await staging.fetch(new Request(config.vars.PUBLIC_ORIGIN+'/api/state?tenantId='+prepared.customers[1-i].tenantId,{headers:{cookie}}),env,{});
   assert.equal(state.status,200);assert.equal((await state.json()).state.billingStagingFixture,i===0?'alpha':'beta');
   for(const route of ['subscriptions','manual-payments','analytics']){
    const res=await staging.fetch(new Request(config.vars.PUBLIC_ORIGIN+'/api/platform/billing/'+route,{headers:{cookie}}),env,{});assert.equal(res.status,403);assert.equal((await res.json()).error,'platform_billing_forbidden');
   }
  }
 }finally{db.close()}
});

test('local D1 rolls back all customer inserts if the second membership fails',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'billing-staging-customer-bootstrap'}}));
 try{
  const DB=await mf.getD1Database('DB');const baseline=readFileSync('cloudflare/schema.sql','utf8');
  for(const table of ['tenants','users','memberships','app_state','subscriptions','payment_orders','payment_fulfillments','entitlement_overrides','platform_regulatory_principals'])await DB.prepare(baseline.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\([\\s\\S]*?\\);'))[0]).run();
  await DB.batch(splitSqliteMigrationStatements(billingStagingMarkerSql(inputs)).map(sql=>DB.prepare(sql)));
  await DB.batch(splitSqliteMigrationStatements(prepareBillingStagingOwner(ownerArgs).sql).map(sql=>DB.prepare(sql)));
  const prepared=prepareBillingStagingCustomers(args);
  await DB.prepare(`CREATE TRIGGER refuse_beta BEFORE INSERT ON memberships WHEN NEW.user_id='${prepared.customers[1].userId}' BEGIN SELECT RAISE(ABORT,'fixture second membership failure'); END`).run();
  await assert.rejects(DB.batch(splitSqliteMigrationStatements(prepared.sql).map(sql=>DB.prepare(sql))),/fixture second membership failure/);
  assert.equal((await DB.prepare('SELECT count(*) n FROM users').first()).n,1);assert.equal((await DB.prepare('SELECT count(*) n FROM tenants').first()).n,1);
  await DB.prepare('DROP TRIGGER refuse_beta').run();await DB.batch(splitSqliteMigrationStatements(prepared.sql).map(sql=>DB.prepare(sql)));
  assert.equal((await DB.prepare('SELECT count(*) n FROM users').first()).n,3);
  await assert.rejects(DB.batch(splitSqliteMigrationStatements(prepared.sql).map(sql=>DB.prepare(sql))),/integer overflow/);
 }finally{await mf.dispose()}
});
