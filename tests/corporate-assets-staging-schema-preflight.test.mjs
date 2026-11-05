import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSET_STAGING_REQUIRED_COLUMNS,corporateAssetsStagingSchemaPreflight} from '../cloudflare/src/corporate-assets-staging-schema-preflight.js';
const id='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const calls=[];
const db=(missingTable)=>({prepare(sql){calls.push(sql);return sql.includes('staging_identity')?{first:async()=>({database_id:id,environment:'corporate-assets-isolated'})}:
  {all:async()=>({results:(ASSET_STAGING_REQUIRED_COLUMNS[sql.slice('PRAGMA table_info('.length,-1)]||[]).filter(name=>!(missingTable==='sessions'&&name==='csrf_token')).map(name=>({name}))})}}});
test('complete schema passes without writes',async()=>{
 calls.length=0;const result=await corporateAssetsStagingSchemaPreflight({APP_ENV:'staging',ASSETS_STAGING_D1_ID:id,DB:db()});
 assert.equal(result.ready,true);assert.ok(calls.every(s=>s.startsWith('SELECT ')||s.startsWith('PRAGMA ')));
});
test('missing critical CSRF field blocks acceptance',async()=>{
 const result=await corporateAssetsStagingSchemaPreflight({APP_ENV:'staging',ASSETS_STAGING_D1_ID:id,DB:db('sessions')});
 assert.deepEqual(result,{ready:false,reason:'missing_required_schema',table:'sessions'});
});
test('missing canonical login rate budget prevents staging delegation',async()=>{
 const checks=[];
 const DB={prepare(sql){checks.push(sql);return sql.includes('staging_identity')
  ?{first:async()=>({database_id:id,environment:'corporate-assets-isolated'})}
  :{all:async()=>({results:sql.includes('auth_rate_limits')?[]:(ASSET_STAGING_REQUIRED_COLUMNS[sql.slice('PRAGMA table_info('.length,-1)]||[]).map(name=>({name}))})}}};
 const result=await corporateAssetsStagingSchemaPreflight({APP_ENV:'staging',ASSETS_STAGING_D1_ID:id,DB});
 assert.deepEqual(result,{ready:false,reason:'missing_required_schema',table:'auth_rate_limits'});
 assert.ok(checks.every(sql=>sql.startsWith('SELECT ')||sql.startsWith('PRAGMA ')));
});
test('wrong profile, identity, or unavailable DB blocks',async()=>{
 assert.equal((await corporateAssetsStagingSchemaPreflight({APP_ENV:'production',ASSETS_STAGING_D1_ID:id,DB:db()})).ready,false);
 assert.equal((await corporateAssetsStagingSchemaPreflight({APP_ENV:'staging',ASSETS_STAGING_D1_ID:id,DB:{prepare:()=>({first:async()=>({database_id:'wrong'})})}})).ready,false);
 assert.equal((await corporateAssetsStagingSchemaPreflight({APP_ENV:'staging',ASSETS_STAGING_D1_ID:id,DB:{prepare:()=>{throw Error('offline')}}})).ready,false);
});
