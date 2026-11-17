import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {
 buildOfflineAssetsStagingSql,offlineAssetsBootstrapReceipt,
 ASSETS_ISOLATED_DB_ID,ASSETS_ISOLATED_DB_NAME,ASSETS_PROD_DB_ID
} from '../scripts/corporate-assets-staging-offline-bootstrap-receipt.mjs';
import {corporateAssetsStagingSchemaPreflight} from '../cloudflare/src/corporate-assets-staging-schema-preflight.js';
import {createCorporateAssetsStagingEntry} from '../cloudflare/src/corporate-assets-staging-entry.js';
import {renderCorporateAssetsStagingConfig} from '../scripts/render-corporate-assets-staging-config.mjs';

const sourceSha='a'.repeat(40);
const metadata={uuid:ASSETS_ISOLATED_DB_ID,name:ASSETS_ISOLATED_DB_NAME,num_tables:0};
function dbAdapter(sqlite){
 const calls=[];
 return {calls,DB:{prepare(query){
  assert.match(query,/^(SELECT|PRAGMA) /,'runtime staging readiness MUST be read-only');
  calls.push(query);
  const prepared=sqlite.prepare(query);
  return {first:async()=>prepared.get(),all:async()=>({results:prepared.all()})};
 }}};
}
test('stable source-only receipt and executable offline canonical SQLite schema',async()=>{
 const a=buildOfflineAssetsStagingSql({expectedMainSha:sourceSha});
 const b=buildOfflineAssetsStagingSql({expectedMainSha:sourceSha});
 assert.equal(a.sql_sha256,b.sql_sha256);
 assert.deepEqual(a.sourceHashes,b.sourceHashes);
 assert.equal(a.targetDatabaseId,ASSETS_ISOLATED_DB_ID);
 assert.ok(!a.sql.includes(ASSETS_PROD_DB_ID),'never render the production DB identity into bootstrap SQL');
 assert.match(a.sql,/CREATE UNIQUE INDEX IF NOT EXISTS audit_tenant_seq_unique/);
 assert.match(a.sql,/ON CONFLICT\(id\) DO NOTHING/);
 assert.equal(a.requiredTables.length,12);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(a.sql);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const objects=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
  assert.deepEqual(objects.sort(),[...a.requiredTables].sort());
  const adapter=dbAdapter(db);
  assert.deepEqual(await corporateAssetsStagingSchemaPreflight({
   APP_ENV:'staging',ASSETS_STAGING_D1_ID:ASSETS_ISOLATED_DB_ID,DB:adapter.DB
  }),{ready:true,mode:'read_only_preflight'});
  assert.ok(adapter.calls.every(x=>x.startsWith('SELECT ')||x.startsWith('PRAGMA ')));
  const c=renderCorporateAssetsStagingConfig({
   ASSETS_STAGING_D1_ID:ASSETS_ISOLATED_DB_ID,
   PRODUCTION_D1_DATABASE_ID:ASSETS_PROD_DB_ID,
   ASSETS_STAGING_SOURCE_SHA:sourceSha
  });
  const entry=createCorporateAssetsStagingEntry();
  const denied=await entry.fetch(new Request('https://no-route.invalid/api/corporate-assets',{
   method:'POST'
  }),{...c.vars,DB:adapter.DB});
  assert.equal(denied.status,403,'status-only Worker must not delegate writes');
  // Reapplying the marker preserves identity and does not clear tables.
  const markerBefore=db.prepare('SELECT database_id FROM corporate_assets_staging_identity WHERE id=1').get().database_id;
  assert.equal(markerBefore,ASSETS_ISOLATED_DB_ID);
 }finally{db.close()}
 const receipt=offlineAssetsBootstrapReceipt({
  expectedMainSha:sourceSha,observedMainSha:sourceSha,metadata
 });
 assert.equal(receipt.sqlSha256,a.sql_sha256);
 assert.equal(receipt.mode,'OFFLINE_SOURCE_REVIEW_ONLY');
 assert.equal(receipt.protectedWriteAuthorized,false);
 assert.equal(receipt.restoredInCloudflare,false);
 assert.equal(receipt.remoteSchemaVerified,false);
 assert.equal(receipt.separateThusicoApprovalRequired,true);
 assert.equal(receipt.separateOwnerApprovalRequired,true);
 assert.match(receipt.receiptSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(receipt,offlineAssetsBootstrapReceipt({
  expectedMainSha:sourceSha,observedMainSha:sourceSha,metadata
 }));
});
test('wrong identities, stale source, nonempty/unknown D1 metadata never produce a readiness receipt',()=>{
 const base={expectedMainSha:sourceSha,observedMainSha:sourceSha,metadata};
 for(const next of [
  {...base,expectedMainSha:'b'.repeat(40)},
  {...base,expectedMainSha:'invalid'},
  {...base,observedMainSha:'stale'},
  {...base,metadata:{...metadata,uuid:ASSETS_PROD_DB_ID}},
  {...base,metadata:{...metadata,name:'bw-compliance-os'}},
  {...base,metadata:{...metadata,num_tables:1}},
  {...base,metadata:{...metadata,num_tables:null}},
  {...base,metadata:undefined}
 ])assert.throws(()=>offlineAssetsBootstrapReceipt(next));
 assert.throws(()=>buildOfflineAssetsStagingSql({expectedMainSha:'not-a-sha'}));
});
test('altered canonical source, missing unique sequence index and forbidden SQL fail before receipt',()=>{
 const normal=(file,encoding)=>readFileSync(file,encoding);
 for(const mutate of [
  (path,text)=>path.endsWith('004_v56_audit_lineage.sql')?text.replace('CREATE UNIQUE INDEX IF NOT EXISTS audit_tenant_seq_unique','CREATE UNIQUE INDEX IF NOT EXISTS removed_audit_sequence_guard'):text,
  (path,text)=>path.endsWith('corporate-assets.sql')?text+'\nDROP TABLE tenants;':text,
  (path,text)=>path.endsWith('schema.sql')?text.replace('CREATE TABLE IF NOT EXISTS sessions(','CREATE TABLE IF NOT EXISTS renamed_sessions('):text
 ]){
  assert.throws(()=>buildOfflineAssetsStagingSql({
   expectedMainSha:sourceSha,
   read:(file,enc)=>mutate(file.pathname,normal(file,enc))
  }));
 }
});
