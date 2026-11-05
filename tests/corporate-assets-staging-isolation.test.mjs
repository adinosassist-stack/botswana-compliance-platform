import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCorporateAssetsStagingConfig,corporateAssetsStagingMarkerSql} from '../scripts/render-corporate-assets-staging-config.mjs';
import {createCorporateAssetsStagingEntry} from '../cloudflare/src/corporate-assets-staging-entry.js';
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
