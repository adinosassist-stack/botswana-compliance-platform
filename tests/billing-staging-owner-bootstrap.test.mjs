import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,statSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {prepareBillingStagingOwner} from '../scripts/prepare-billing-staging-owner.mjs';
import {renderBillingStagingConfig,billingStagingMarkerSql} from '../scripts/render-billing-staging-config.mjs';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import staging from '../cloudflare/src/billing-staging-entry.js';
import {__platformOwnerAccessTest} from '../cloudflare/src/platform-owner-access.js';

const inputs={BILLING_STAGING_D1_ID:'11111111-1111-4111-8111-111111111111',PRODUCTION_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',BILLING_STAGING_SOURCE_SHA:'a'.repeat(40),BILLING_STAGING_ADMIN_EMAILS:'thebedesk@gmail.com'};
const config=renderBillingStagingConfig(inputs);
const password='Isolated-staging-fixture-only!';
const args={config,email:'thebedesk@gmail.com',password,expectedDatabaseId:inputs.BILLING_STAGING_D1_ID,productionDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID,sourceSha:inputs.BILLING_STAGING_SOURCE_SHA};
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('cloudflare/schema.sql','utf8'));db.exec(billingStagingMarkerSql(inputs));
 return db;
}
const counts=db=>Object.fromEntries(['tenants','users','memberships','app_state','subscriptions','payment_orders','payment_fulfillments','entitlement_overrides','platform_regulatory_principals'].map(t=>[t,db.prepare(`SELECT count(*) n FROM ${t}`).get().n]));

test('bootstrap prepares only an independent inactive staging owner with a canonical password hash',async()=>{
 const db=fixture();try{
  const result=prepareBillingStagingOwner(args);assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,0);
  assert.ok(!result.sql.includes(password));db.exec(result.sql);
  assert.deepEqual(counts(db),{tenants:1,users:1,memberships:1,app_state:1,subscriptions:1,payment_orders:0,payment_fulfillments:0,entitlement_overrides:0,platform_regulatory_principals:0});
  const user=db.prepare('SELECT * FROM users').get();assert.equal(user.email,args.email);
  assert.ok(await __platformOwnerAccessTest.verifyStoredPassword(password,user.password_hash));
  assert.equal(await __platformOwnerAccessTest.verifyStoredPassword('incorrect-password',user.password_hash),false);
  assert.equal(db.prepare('SELECT status FROM subscriptions').get().status,'inactive');
  const before=counts(db);assert.throws(()=>db.exec(prepareBillingStagingOwner(args).sql),/integer overflow/);assert.deepEqual(counts(db),before);
 }finally{db.close()}
});
test('prepared email literals cannot alter the SQL structure',()=>{
 const email="o'wner@example.invalid";
 const c=renderBillingStagingConfig({...inputs,BILLING_STAGING_ADMIN_EMAILS:email});
 const db=fixture();try{db.exec(prepareBillingStagingOwner({...args,config:c,email}).sql);assert.equal(db.prepare('SELECT email FROM users').get().email,email)}finally{db.close()}
});
test('CLI reads the password from stdin and exclusively creates a private SQL file',()=>{
 const dir=mkdtempSync(join(tmpdir(),'billing-owner-cli-'));
 try{
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const c=renderBillingStagingConfig({...inputs,BILLING_STAGING_SOURCE_SHA:sourceSha});
  const configPath=join(dir,'config.json'),out=join(dir,'owner.sql');writeFileSync(configPath,JSON.stringify(c));
  const cli=['scripts/prepare-billing-staging-owner.mjs','--config',configPath,'--email',args.email,'--database',args.expectedDatabaseId,'--out',out];
  const opts={encoding:'utf8',input:password,env:{...process.env,PRODUCTION_D1_DATABASE_ID:inputs.PRODUCTION_D1_DATABASE_ID}};
  const result=spawnSync(process.execPath,cli,opts);assert.equal(result.status,0);assert.equal(statSync(out).mode&0o777,0o600);
  assert.ok(!result.stdout.includes(password));assert.ok(!result.stderr.includes(password));assert.doesNotMatch(result.stdout,/pbkdf2\$/);
  const original=readFileSync(out,'utf8');assert.equal(spawnSync(process.execPath,cli,opts).status,1);assert.equal(readFileSync(out,'utf8'),original);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

for(const change of [{expectedDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID},{expectedDatabaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'},{sourceSha:'b'.repeat(40)},{email:'not-designated@example.invalid'},{password:'short'}])test('preparation refuses invalid authority '+JSON.stringify({...change,password:change.password?'redacted':undefined}),()=>{
 assert.throws(()=>prepareBillingStagingOwner({...args,...change}),/billing_staging_/);
});
for(const change of [{name:'bw-compliance-os'},{vars:{...config.vars,APP_ENV:'production'}},{vars:{...config.vars,POP_UPLOAD_STAGING_ENABLED:'true'}},{d1_databases:[...config.d1_databases,...config.d1_databases]},{r2_buckets:[{binding:'EVIDENCE',bucket_name:'bw-compliance-evidence'}]}])test('preparation rejects configuration drift '+JSON.stringify(change),()=>{
 assert.throws(()=>prepareBillingStagingOwner({...args,config:{...config,...change}}),/billing_staging_/);
});
for(const mutation of ["DELETE FROM billing_staging_identity","UPDATE billing_staging_identity SET database_id='wrong-db'","INSERT INTO tenants(id,name) VALUES('existing','Existing tenant')"])test('SQL guard prevents all account writes when preconditions change: '+mutation,()=>{
 const db=fixture();try{const result=prepareBillingStagingOwner(args);db.exec(mutation);const before=counts(db);assert.throws(()=>db.exec(result.sql),/integer overflow/);assert.deepEqual(counts(db),before)}finally{db.close()}
});

test('prepared staging owner can authenticate through the real staging entry without production repair',async()=>{
 const db=fixture();try{
  db.exec(prepareBillingStagingOwner(args).sql);
  const DB={prepare(sql){let values=[];return {bind(...p){values=p;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}}}}}};
  const env={...config.vars,DB,SESSION_SECRET:'staging-session-fixture-secret-'.repeat(3),AUDIT_INTEGRITY_SECRET:'staging-audit-fixture-secret-'.repeat(3)};
  const response=await staging.fetch(new Request(config.vars.PUBLIC_ORIGIN+'/api/auth/login',{method:'POST',headers:{origin:config.vars.PUBLIC_ORIGIN,'content-type':'application/json'},body:JSON.stringify({email:args.email,password})}),env,{});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.user.email,args.email);assert.equal(body.user.role,'owner');assert.ok(response.headers.get('set-cookie'));
  assert.equal(db.prepare('SELECT count(*) n FROM platform_regulatory_principals').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM entitlement_overrides').get().n,0);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const queue=await staging.fetch(new Request(config.vars.PUBLIC_ORIGIN+'/api/platform/billing/manual-payments',{headers:{cookie}}),env,{});
  assert.equal(queue.status,200);assert.deepEqual((await queue.json()).items,[]);
  const blocked=await staging.fetch(new Request(config.vars.PUBLIC_ORIGIN+'/api/platform/billing/subscription-access',{method:'POST',headers:{cookie,origin:config.vars.PUBLIC_ORIGIN,'x-csrf-token':body.csrfToken},body:'{}'}),env,{});
  assert.equal(blocked.status,403);assert.equal((await blocked.json()).error,'billing_staging_mutations_disabled');
  assert.equal(db.prepare('SELECT count(*) n FROM payment_orders').get().n,0);
 }finally{db.close()}
});

test('local D1 applies bootstrap as a batch and rolls back partial account creation on failure',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'billing-staging-owner-bootstrap'}}));
 try{
  const DB=await mf.getD1Database('DB');
  const baseline=readFileSync('cloudflare/schema.sql','utf8');
  for(const table of ['tenants','users','memberships','app_state','subscriptions'])await DB.prepare(baseline.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\([\\s\\S]*?\\);'))[0]).run();
  await DB.prepare('CREATE TABLE payment_orders(id TEXT)').run();
  await DB.batch(splitSqliteMigrationStatements(billingStagingMarkerSql(inputs)).map(sql=>DB.prepare(sql)));
  const result=prepareBillingStagingOwner(args);
  await DB.prepare("CREATE TRIGGER refuse_membership BEFORE INSERT ON memberships BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
  await assert.rejects(DB.batch(splitSqliteMigrationStatements(result.sql).map(sql=>DB.prepare(sql))),/fixture failure/);
  assert.equal((await DB.prepare('SELECT count(*) n FROM users').first()).n,0);assert.equal((await DB.prepare('SELECT count(*) n FROM tenants').first()).n,0);
  await DB.prepare('DROP TRIGGER refuse_membership').run();
  await DB.batch(splitSqliteMigrationStatements(result.sql).map(sql=>DB.prepare(sql)));
  assert.equal((await DB.prepare('SELECT status FROM subscriptions').first()).status,'inactive');
  await assert.rejects(DB.batch(splitSqliteMigrationStatements(result.sql).map(sql=>DB.prepare(sql))),/integer overflow/);
  assert.equal((await DB.prepare('SELECT count(*) n FROM users').first()).n,1);
 }finally{await mf.dispose()}
});
