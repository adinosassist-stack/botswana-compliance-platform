import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {buildAssetsAuditRepairReview} from '../scripts/corporate-assets-staging-additive-audit-plan.mjs';
import {
 buildOfflineAssetsStagingSql,ASSETS_ISOLATED_DB_ID,ASSETS_ISOLATED_DB_NAME
} from '../scripts/corporate-assets-staging-offline-bootstrap-receipt.mjs';
import {corporateAssetsStagingSchemaPreflight} from '../cloudflare/src/corporate-assets-staging-schema-preflight.js';

const sha='a'.repeat(40);
const metadata={uuid:ASSETS_ISOLATED_DB_ID,name:ASSETS_ISOLATED_DB_NAME,num_tables:11};
function fakeDB(sqlite){
 return {prepare(sql){
  if(!/^(SELECT|PRAGMA) /i.test(sql))throw Error('unexpected remote write attempted');
  const statement=sqlite.prepare(sql);
  return {first:async()=>statement.get(),all:async()=>({results:statement.all()})};
 }};
}
function catalog(db){
 const objects=db.prepare("SELECT type,name FROM sqlite_master WHERE type IN ('table','view','index','trigger') AND name NOT LIKE 'sqlite_%'").all();
 const rowCounts={};
 for(const name of ['tenants','users','memberships','corporate_assets','corporate_asset_services','corporate_assets_staging_identity']){
  rowCounts[name]=db.prepare('SELECT COUNT(*) AS n FROM '+name).get().n;
 }
 return {objects,rowCounts,marker:db.prepare('SELECT database_id,environment FROM corporate_assets_staging_identity WHERE id=1').get()};
}
function partialFixture(){
 const db=new DatabaseSync(':memory:');
 const complete=buildOfflineAssetsStagingSql({expectedMainSha:sha});
 const tableRe=/CREATE TABLE IF NOT EXISTS audit_integrity_checks\([\s\S]*?\n\);/g;
 assert.equal((complete.sql.match(tableRe)||[]).length,1);
 db.exec(complete.sql.replace(tableRe,''));
 db.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run('synthetic-tenant-a','Synthetic Branch');
 db.prepare('INSERT INTO users(id,email) VALUES(?,?)').run('synthetic-user-a','owner@example.invalid');
 db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").run('synthetic-tenant-a','synthetic-user-a');
 db.prepare("INSERT INTO corporate_assets(id,tenant_id,name,category,branch,acquisition_date,acquisition_cost_minor,book_value_minor,status) VALUES(?,?,?,?,?,?,?,?,?)")
  .run('synthetic-asset-a','synthetic-tenant-a','Synthetic Pump','machinery','Synthetic Branch','2026-01-01',100000,90000,'active');
 db.prepare("INSERT INTO corporate_asset_services(id,tenant_id,asset_id,kind,serviced_on,due_on,cost_minor,description) VALUES(?,?,?,?,?,?,?,?)")
  .run('synthetic-service-a','synthetic-tenant-a','synthetic-asset-a','service','2026-01-01','2027-01-01',1000,'Synthetic periodic service');
 return db;
}
const check=async db=>corporateAssetsStagingSchemaPreflight({
 APP_ENV:'staging',ASSETS_STAGING_D1_ID:ASSETS_ISOLATED_DB_ID,DB:fakeDB(db)
});
test('canonical additive proposal preserves existing synthetic rows and repairs only audit table/index gaps offline',async()=>{
 const db=partialFixture();
 try{
  assert.deepEqual(await check(db),{ready:false,reason:'missing_required_schema',table:'audit_integrity_checks'});
  const existing=catalog(db);
  const params={expectedMainSha:sha,observedMainSha:sha,metadata,catalog:existing};
  const review=buildAssetsAuditRepairReview(params);
  assert.equal(review.mode,'OFFLINE_ONLY_REVIEW_CANDIDATE');
  assert.equal(review.remoteWriteAuthorized,false);
  assert.equal(review.productionWriteAuthorized,false);
  assert.equal(review.statements,3);
  assert.deepEqual(review.missingRequiredTables,['audit_integrity_checks']);
  assert.match(review.sql,/CREATE TABLE IF NOT EXISTS audit_integrity_checks/);
  assert.match(review.sql,/CREATE INDEX IF NOT EXISTS audit_integrity_checks_tenant_idx/);
  assert.match(review.sql,/CREATE INDEX IF NOT EXISTS audit_write_failures_tenant_idx/);
  assert.ok(!review.sql.includes('DROP TABLE'));
  const before=JSON.stringify([
   db.prepare('SELECT id,name FROM tenants').all(),
   db.prepare('SELECT id,email FROM users').all(),
   db.prepare('SELECT id,name,book_value_minor FROM corporate_assets').all(),
   db.prepare('SELECT id,cost_minor FROM corporate_asset_services').all()
  ]);
  db.exec(review.sql);
  assert.deepEqual(await check(db),{ready:true,mode:'read_only_preflight'});
  const after=JSON.stringify([
   db.prepare('SELECT id,name FROM tenants').all(),
   db.prepare('SELECT id,email FROM users').all(),
   db.prepare('SELECT id,name,book_value_minor FROM corporate_assets').all(),
   db.prepare('SELECT id,cost_minor FROM corporate_asset_services').all()
  ]);
  assert.equal(after,before,'existing data must be byte-identical after additive DDL');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'audit_%'").all().map(x=>x.name);
  assert.ok(indexes.includes('audit_integrity_checks_tenant_idx'));
  assert.ok(indexes.includes('audit_write_failures_tenant_idx'));
  db.exec(review.sql);
  assert.deepEqual(await check(db),{ready:true,mode:'read_only_preflight'});
  assert.throws(()=>buildAssetsAuditRepairReview({...params,catalog:catalog(db)}),/isolated_audit_only_repair_scope_required/);
 }finally{db.close()}
});
test('reject wrong identity, extra missing tables, malformed canonical DDL and an empty target',()=>{
 const db=partialFixture();
 try{
  const base={expectedMainSha:sha,observedMainSha:sha,metadata,catalog:catalog(db)};
  assert.throws(()=>buildAssetsAuditRepairReview({...base,observedMainSha:'b'.repeat(40)}));
  assert.throws(()=>buildAssetsAuditRepairReview({...base,metadata:{...metadata,uuid:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'}}));
  assert.throws(()=>buildAssetsAuditRepairReview({...base,catalog:{...base.catalog,marker:{database_id:'wrong',environment:'corporate-assets-isolated'}}}));
  assert.throws(()=>buildAssetsAuditRepairReview({...base,catalog:{...base.catalog,objects:base.catalog.objects.filter(x=>x.name!=='sessions')}}));
  assert.throws(()=>buildAssetsAuditRepairReview({
   ...base,
   read:(file,encoding)=>readFileSync(file,encoding).replace(
    'CREATE TABLE IF NOT EXISTS audit_integrity_checks(',
    'CREATE TABLE IF NOT EXISTS renamed_audit_checks(')
  }),/canonical_audit_sql_drift_integrity_table/);
 }finally{db.close()}
});
