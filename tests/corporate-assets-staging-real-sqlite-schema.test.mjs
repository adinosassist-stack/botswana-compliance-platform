/** Corporate Assets: offline schema parity rehearsal, never remote Cloudflare D1.
 * Assembles the canonical auth/audit table DDL plus the guarded Assets schema
 * in an ephemeral, empty node:sqlite database. All preflight queries are read-only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {corporateAssetsStagingSchemaPreflight} from '../cloudflare/src/corporate-assets-staging-schema-preflight.js';
import {corporateAssetsStagingMarkerSql} from '../scripts/render-corporate-assets-staging-config.mjs';

const STAGING='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const PRODUCTION='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const markerConfig={ASSETS_STAGING_D1_ID:STAGING,PRODUCTION_D1_DATABASE_ID:PRODUCTION,ASSETS_STAGING_SOURCE_SHA:'a'.repeat(40)};
const base=readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../cloudflare/migrations/004_v56_audit_lineage.sql',import.meta.url),'utf8');
const assets=readFileSync(new URL('../cloudflare/schema/corporate-assets.sql',import.meta.url),'utf8');

function tableDDL(source,name){
 const re=new RegExp('CREATE TABLE(?: IF NOT EXISTS)?\\s+'+name+'\\s*\\([\\s\\S]*?\\n\\);','i');
 const found=source.match(re);
 assert.ok(found,'canonical table missing: '+name);
 return found[0];
}
function fixture({skipAuditWriteSource=false,markerMismatch=false}={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec('PRAGMA foreign_keys=ON;');
 for(const name of ['tenants','users','memberships','auth_rate_limits','sessions','audit_events'])
  sql.exec(tableDDL(base,name));
 const additions=migration.match(/^ALTER TABLE audit_events ADD COLUMN [^;]+;$/gm)||[];
 assert.equal(additions.length,5,'unexpected canonical audit migration requires review');
 for(const statement of additions){
  if(skipAuditWriteSource&&statement.includes('write_source'))continue;
  sql.exec(statement);
 }
 for(const name of ['audit_chain_state','audit_write_failures','audit_integrity_checks'])
  sql.exec(tableDDL(migration,name));
 sql.exec(assets);
 sql.exec(corporateAssetsStagingMarkerSql(markerConfig));
 if(markerMismatch)sql.prepare('UPDATE corporate_assets_staging_identity SET database_id=? WHERE id=1').run('11111111-1111-4111-8111-111111111111');
 const statements=[];
 const DB={prepare(query){
  statements.push(query);
  if(!query.startsWith('SELECT ')&&!query.startsWith('PRAGMA '))
   throw Error('preflight attempted a non-read operation');
  const prepared=sql.prepare(query);
  return {first:async()=>prepared.get(),all:async()=>({results:prepared.all()})};
 }};
 return {sql,DB,statements};
}
const check=async f=>corporateAssetsStagingSchemaPreflight({
 APP_ENV:'staging',ASSETS_STAGING_D1_ID:STAGING,DB:f.DB
});

test('real canonical SQLite auth/audit/asset schema passes read-only staging preflight',async()=>{
 const f=fixture();
 try{
  const result=await check(f);
  assert.deepEqual(result,{ready:true,mode:'read_only_preflight'});
  assert.ok(f.statements.length>=10);
  assert.ok(f.statements.every(q=>q.startsWith('SELECT ')||q.startsWith('PRAGMA ')));
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM corporate_assets').get().n,0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n,0);
 }finally{f.sql.close()}
});

test('real canonical SQLite schema without audit write-source column rejects acceptance',async()=>{
 const f=fixture({skipAuditWriteSource:true});
 try{
  assert.deepEqual(await check(f),{ready:false,reason:'missing_required_schema',table:'audit_events'});
  assert.ok(f.statements.every(q=>q.startsWith('SELECT ')||q.startsWith('PRAGMA ')));
 }finally{f.sql.close()}
});

test('real canonical SQLite schema with a mismatched identity marker rejects acceptance',async()=>{
 const f=fixture({markerMismatch:true});
 try{
  assert.deepEqual(await check(f),{ready:false,reason:'isolated_database_identity_required'});
  assert.deepEqual(f.statements,['SELECT database_id,environment FROM corporate_assets_staging_identity WHERE id=1']);
 }finally{f.sql.close()}
});
