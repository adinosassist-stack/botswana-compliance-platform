import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCorporateAssetsStagingConfig,corporateAssetsStagingMarkerSql} from '../scripts/render-corporate-assets-staging-config.mjs';
import {createCorporateAssetsStagingEntry} from '../cloudflare/src/corporate-assets-staging-entry.js';
import {DatabaseSync} from 'node:sqlite';
const staging='e19f09de-3bb9-4021-b4f8-44df04c8aaa8',prod='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',sha='a'.repeat(40);
const env={ASSETS_STAGING_D1_ID:staging,PRODUCTION_D1_DATABASE_ID:prod,ASSETS_STAGING_SOURCE_SHA:sha};
test('staging config uses separate DB, no routes, no automatic writes',()=>{
 const c=renderCorporateAssetsStagingConfig(env);assert.equal(c.name,'bw-corporate-assets-staging');
 assert.deepEqual(c.routes,[]);assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);
 assert.equal(c.vars.THEBE_CORPORATE_ASSETS_ENABLED,'false');assert.equal(c.vars.ASSETS_STAGING_WRITES_ENABLED,'false');
 assert.equal(c.d1_databases[0].database_id,staging);assert.ok(c.main.endsWith('corporate-assets-staging-entry.js'));
 assert.match(corporateAssetsStagingMarkerSql(env),/corporate-assets-isolated/);
});
test('production, other staging DBs, missing source SHA denied',()=>{
 for(const id of [prod,'9d1b8852-4424-46e9-ba24-cdad5ced215f','812f9021-890b-41e6-8fa1-6001f90a9b53'])assert.throws(()=>renderCorporateAssetsStagingConfig({...env,ASSETS_STAGING_D1_ID:id}));
 assert.throws(()=>renderCorporateAssetsStagingConfig({...env,ASSETS_STAGING_SOURCE_SHA:''}));
});
test('staging entry fail-closed and responds only to isolated marker status',async()=>{
 const entry=createCorporateAssetsStagingEntry(),c=renderCorporateAssetsStagingConfig(env);
 const runtime={...c.vars,DB:{prepare:()=>({first:async()=>({database_id:staging,environment:'corporate-assets-isolated'})})}};
 const url='https://internal.invalid/api/corporate-assets-staging/status';
 assert.equal((await entry.fetch(new Request(url),runtime)).status,200);
 assert.equal((await entry.fetch(new Request(url,{method:'POST'}),runtime)).status,403);
 assert.equal((await entry.fetch(new Request('https://internal.invalid/api/corporate-assets'),runtime)).status,403);
 assert.equal((await entry.fetch(new Request(url),{...runtime,THEBE_CORPORATE_ASSETS_ENABLED:'true'})).status,503);
 assert.equal((await entry.fetch(new Request(url),{...runtime,DB:{prepare:()=>({first:async()=>null})}})).status,503);
});

test('marker SQL is idempotent and never relabels a different staging database',async()=>{
 const sql=corporateAssetsStagingMarkerSql(env);
 assert.match(sql,/ON CONFLICT\(id\) DO NOTHING/);
 assert.doesNotMatch(sql,/DO UPDATE SET/);
 const d=new DatabaseSync(':memory:');
 try{
  d.exec(sql);
  const created=d.prepare('SELECT database_id,environment FROM corporate_assets_staging_identity WHERE id=1').get();
  assert.equal(created.database_id,staging);
  assert.equal(created.environment,'corporate-assets-isolated');
  d.exec(sql);
  assert.equal(d.prepare('SELECT COUNT(*) total FROM corporate_assets_staging_identity').get().total,1);
  const other='11111111-1111-4111-8111-111111111111';
  d.prepare('UPDATE corporate_assets_staging_identity SET database_id=? WHERE id=1').run(other);
  d.exec(sql);
  assert.equal(d.prepare('SELECT database_id FROM corporate_assets_staging_identity WHERE id=1').get().database_id,other,
   'bootstrap SQL must not overwrite a pre-existing identity');
  const entry=createCorporateAssetsStagingEntry();
  const db={prepare:q=>({first:async()=>d.prepare(q).get()})};
  const response=await entry.fetch(new Request('https://internal.invalid/api/corporate-assets-staging/status'),{
   ...renderCorporateAssetsStagingConfig(env).vars,DB:db
  });
  assert.equal(response.status,503,'status-only Worker must refuse mismatched marker');
 }finally{d.close()}
});