import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,statSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {prepareBillingStagingAlphaReset} from '../scripts/prepare-billing-staging-alpha-reset.mjs';
import {prepareBillingStagingOwner} from '../scripts/prepare-billing-staging-owner.mjs';
import {prepareBillingStagingCustomers} from '../scripts/prepare-billing-staging-customers.mjs';
import {prepareBillingStagingPayments} from '../scripts/prepare-billing-staging-payments.mjs';
import {renderBillingStagingConfig,billingStagingMarkerSql} from '../scripts/render-billing-staging-config.mjs';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import staging from '../cloudflare/src/billing-staging-entry.js';

const inputs={BILLING_STAGING_D1_ID:'11111111-1111-4111-8111-111111111111',PRODUCTION_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',BILLING_STAGING_SOURCE_SHA:'a'.repeat(40),BILLING_STAGING_ADMIN_EMAILS:'billing-owner@example.invalid'};
const passwords={owner:'Owner-staging-test-password!',alpha:'Alpha-staging-old-password!',beta:'Beta-staging-test-password!'};
const options={config:renderBillingStagingConfig(inputs),ownerEmail:inputs.BILLING_STAGING_ADMIN_EMAILS,expectedDatabaseId:inputs.BILLING_STAGING_D1_ID,productionDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID,sourceSha:inputs.BILLING_STAGING_SOURCE_SHA,expectedGeneration:0,password:'Alpha-staging-replacement-password!',confirmation:'Alpha-staging-replacement-password!'};
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('cloudflare/schema.sql','utf8'));db.exec(billingStagingMarkerSql(inputs));
 db.exec(prepareBillingStagingOwner({...options,email:options.ownerEmail,password:passwords.owner}).sql);
 const customers=prepareBillingStagingCustomers({...options,alphaPassword:passwords.alpha,betaPassword:passwords.beta});db.exec(customers.sql);db.exec(prepareBillingStagingPayments(options).sql);
 const alpha=customers.customers[0],beta=customers.customers[1];
 db.prepare("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+1 hour'))").run('alpha-old-reset-token',alpha.userId);
 db.prepare("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+1 hour'))").run('beta-unrelated-reset-token',beta.userId);
 return {db,alpha,beta,args:{...options,tenantId:alpha.tenantId}};
}
function atomic(db,sql){db.exec('BEGIN');try{db.exec(sql);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
const businessSnapshot=db=>JSON.stringify(Object.fromEntries(['tenants','memberships','app_state','subscriptions','payment_orders','manual_payment_submissions','manual_payment_events','payment_fulfillments','entitlement_overrides','platform_regulatory_principals'].map(t=>[t,db.prepare('SELECT * FROM '+t).all()])));

test('Alpha reset changes only its credential/generation, revokes sessions and reset tokens, and preserves all business data',async()=>{
 const f=fixture();try{
  const DB={prepare(sql){let values=[];return {bind(...p){values=p;return this},async first(){return f.db.prepare(sql).get(...values)||null},async all(){return {results:f.db.prepare(sql).all(...values)}},async run(){return {meta:{changes:Number(f.db.prepare(sql).run(...values).changes)}}}}}};
  const env={...options.config.vars,DB,SESSION_SECRET:'alpha-reset-local-session-secret-'.repeat(3)};
  const send=(path,init={})=>staging.fetch(new Request(options.config.vars.PUBLIC_ORIGIN+path,init),env,{});
  const login=async(email,password)=>send('/api/auth/login',{method:'POST',headers:{origin:options.config.vars.PUBLIC_ORIGIN,'content-type':'application/json'},body:JSON.stringify({email,password})});
  const cookies={};for(const [key,email] of [['owner',options.ownerEmail],['alpha',f.alpha.email],['beta',f.beta.email]]){const r=await login(email,passwords[key]);assert.equal(r.status,200);cookies[key]=r.headers.get('set-cookie').split(';')[0]}
  const before=businessSnapshot(f.db),others=f.db.prepare('SELECT * FROM users WHERE id!=? ORDER BY id').all(f.alpha.userId);
  const prepared=prepareBillingStagingAlphaReset(f.args);assert.ok(!prepared.sql.includes(options.password));atomic(f.db,prepared.sql);
  assert.equal(businessSnapshot(f.db),before);assert.deepEqual(f.db.prepare('SELECT * FROM users WHERE id!=? ORDER BY id').all(f.alpha.userId),others);
  assert.equal(f.db.prepare('SELECT session_generation n FROM users WHERE id=?').get(f.alpha.userId).n,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(f.alpha.userId).n,0);
  assert.ok(f.db.prepare("SELECT used_at FROM password_reset_tokens WHERE token_hash='alpha-old-reset-token'").get().used_at);
  assert.equal(f.db.prepare("SELECT used_at FROM password_reset_tokens WHERE token_hash='beta-unrelated-reset-token'").get().used_at,null);
  assert.equal((await send('/api/auth/me',{headers:{cookie:cookies.alpha}})).status,401);
  for(const key of ['owner','beta'])assert.equal((await send('/api/auth/me',{headers:{cookie:cookies[key]}})).status,200);
  assert.equal((await login(f.alpha.email,passwords.alpha)).status,401);assert.equal((await login(f.alpha.email,options.password)).status,200);
  const after=f.db.prepare('SELECT password_hash FROM users WHERE id=?').get(f.alpha.userId).password_hash;
  assert.throws(()=>atomic(f.db,prepared.sql),/integer overflow/);assert.equal(f.db.prepare('SELECT password_hash FROM users WHERE id=?').get(f.alpha.userId).password_hash,after);
 }finally{f.db.close()}
});

for(const mutation of ['DELETE FROM billing_staging_identity',"UPDATE billing_staging_identity SET database_id='wrong'","UPDATE users SET session_generation=1 WHERE email='alpha.billing-staging@example.invalid'","UPDATE users SET email='changed@example.invalid' WHERE email='alpha.billing-staging@example.invalid'","UPDATE app_state SET state_json='{}'","UPDATE subscriptions SET status='active'","UPDATE memberships SET status='inactive'","UPDATE payment_orders SET status='paid',paid_at=CURRENT_TIMESTAMP"])test('reset refuses changed target state without credential writes: '+mutation,()=>{
 const f=fixture();try{const prepared=prepareBillingStagingAlphaReset(f.args);f.db.exec(mutation);const before=JSON.stringify(f.db.prepare('SELECT * FROM users ORDER BY id').all());assert.throws(()=>atomic(f.db,prepared.sql),/integer overflow/);assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM users ORDER BY id').all()),before)}finally{f.db.close()}
});
for(const patch of [{expectedDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID},{sourceSha:'b'.repeat(40)},{tenantId:'not-a-uuid'},{expectedGeneration:-1},{expectedGeneration:2147483647},{confirmation:'different-password-value'},{password:'short',confirmation:'short'},{password:'line\nbreak-password-value',confirmation:'line\nbreak-password-value'},{config:{...options.config,vars:{...options.config.vars,POP_UPLOAD_STAGING_ENABLED:'true'}}}])test('preparation refuses unsafe local inputs '+Object.keys(patch),()=>{
 assert.throws(()=>prepareBillingStagingAlphaReset({...options,tenantId:'33333333-3333-4333-8333-333333333333',...patch}),/billing_staging_/);
});
test('Beta tenant cannot be substituted for Alpha',()=>{const f=fixture();try{assert.throws(()=>atomic(f.db,prepareBillingStagingAlphaReset({...f.args,tenantId:f.beta.tenantId}).sql),/integer overflow/)}finally{f.db.close()}});

test('CLI reads confirmed private stdin, creates mode-0600 SQL exclusively, and never prints the password/hash',()=>{
 const f=fixture(),dir=mkdtempSync(join(tmpdir(),'alpha-reset-'));try{
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),config=join(dir,'config.json'),out=join(dir,'reset.sql');
  writeFileSync(config,JSON.stringify(renderBillingStagingConfig({...inputs,BILLING_STAGING_SOURCE_SHA:sourceSha})));
  const argv=['scripts/prepare-billing-staging-alpha-reset.mjs','--config',config,'--owner-email',options.ownerEmail,'--database',options.expectedDatabaseId,'--tenant',f.alpha.tenantId,'--generation','0','--out',out];
  const run=()=>spawnSync(process.execPath,argv,{input:options.password+'\n'+options.confirmation,encoding:'utf8',env:{...process.env,PRODUCTION_D1_DATABASE_ID:options.productionDatabaseId}});
  const r=run();assert.equal(r.status,0,r.stderr);assert.equal(statSync(out).mode&0o777,0o600);assert.ok(!(r.stdout+r.stderr).includes(options.password));assert.ok(!(r.stdout+r.stderr).includes('pbkdf2$'));
  const before=readFileSync(out,'utf8');assert.equal(run().status,1);assert.equal(readFileSync(out,'utf8'),before);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true})}
});

test('local D1 rolls back the password and generation if session revocation fails, then applies once',async()=>{
 const f=fixture();const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'alpha-reset-test'}}));
 try{
  const DB=await mf.getD1Database('DB'),baseline=readFileSync('cloudflare/schema.sql','utf8');
  for(const table of ['users','tenants','memberships','app_state','subscriptions','payment_orders','payment_fulfillments','entitlement_overrides','sessions','password_reset_tokens'])await DB.prepare(baseline.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\([\\s\\S]*?\\);'))[0]).run();
  await DB.batch(splitSqliteMigrationStatements(billingStagingMarkerSql(inputs)).map(s=>DB.prepare(s)));
  for(const table of ['tenants','users','memberships','app_state','subscriptions'])for(const row of f.db.prepare('SELECT * FROM '+table).all())await DB.prepare('INSERT INTO '+table+'('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').bind(...Object.values(row)).run();
  await DB.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,expires_at) VALUES('old-alpha',?,?, 'owner',datetime('now','+1 day'))").bind(f.alpha.userId,f.alpha.tenantId).run();
  await DB.prepare("CREATE TRIGGER refuse_alpha_revoke BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'revocation-failed'); END").run();
  const prepared=prepareBillingStagingAlphaReset(f.args),batch=()=>DB.batch(splitSqliteMigrationStatements(prepared.sql).map(s=>DB.prepare(s)));
  const before=await DB.prepare('SELECT password_hash,session_generation FROM users WHERE id=?').bind(f.alpha.userId).first();
  await assert.rejects(batch(),/revocation-failed/);assert.deepEqual(await DB.prepare('SELECT password_hash,session_generation FROM users WHERE id=?').bind(f.alpha.userId).first(),before);
  await DB.prepare('DROP TRIGGER refuse_alpha_revoke').run();await batch();assert.equal((await DB.prepare('SELECT session_generation n FROM users WHERE id=?').bind(f.alpha.userId).first()).n,1);
  await assert.rejects(batch(),/integer overflow/);assert.equal((await DB.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').bind(f.alpha.userId).first()).n,0);
 }finally{f.db.close();await mf.dispose()}
});
