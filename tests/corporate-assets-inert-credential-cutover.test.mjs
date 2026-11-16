/** Offline-only isolation rehearsal for the status-only Assets staging Worker.
 * This uses synthetic secrets and a fake DB; never accesses Cloudflare or D1.
 * Passing results do NOT prove live secret rotation, session compatibility,
 * audit signature continuity, authenticated acceptance or deployment readiness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorporateAssetsStagingEntry} from '../cloudflare/src/corporate-assets-staging-entry.js';
import {renderCorporateAssetsStagingConfig} from '../scripts/render-corporate-assets-staging-config.mjs';

const STAGING_D1='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const PROD_D1='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const LEGACY_SHA='062ef3ea4c598d38a56e15dba1691c30aa4e5c72';
const BASE_URL='https://inert.internal.invalid';
const STATUS='/api/corporate-assets-staging/status';
const MARKER_SQL='SELECT database_id,environment FROM corporate_assets_staging_identity WHERE id=1';
const OLD_SESSION='synthetic-old-session-do-not-use';
const NEW_SESSION='synthetic-new-session-do-not-use';
const OLD_AUDIT='synthetic-old-audit-do-not-use';
const NEW_AUDIT='synthetic-new-audit-do-not-use';
const app=createCorporateAssetsStagingEntry();
const base=renderCorporateAssetsStagingConfig({
 ASSETS_STAGING_SOURCE_SHA:LEGACY_SHA,ASSETS_STAGING_D1_ID:STAGING_D1,
 PRODUCTION_D1_DATABASE_ID:PROD_D1
});
function fixture({rotated=false,marker={database_id:STAGING_D1,environment:'corporate-assets-isolated'},throwOnRead=false}={}){
 const sql=[],writes=[];
 const DB={
  prepare(statement){
   sql.push(statement);
   if(statement!==MARKER_SQL)throw Error('unexpected_statement');
   return {first:async()=>{if(throwOnRead)throw Error('synthetic_read_failure');return marker;},
    run:async()=>{writes.push('run');throw Error('writes_forbidden');},
    all:async()=>{writes.push('all');throw Error('nonstatus_read_forbidden');}};
  },
  exec:async()=>{writes.push('exec');throw Error('writes_forbidden');},
  batch:async()=>{writes.push('batch');throw Error('writes_forbidden');}
 };
 const env={...base.vars,DB,
  SESSION_SECRET:rotated?NEW_SESSION:OLD_SESSION,
  AUDIT_INTEGRITY_SECRET:rotated?NEW_AUDIT:OLD_AUDIT};
 return {env,sql,writes};
}
const hit=(url=STATUS,method='GET',env)=>app.fetch(new Request(BASE_URL+url,{method}),env);
async function responseBody(response){
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
 assert.equal(response.headers.get('x-thebe-assets-staging'),'isolated');
 return response.json();
}
test('synthetic credential replacement cannot expand status-only routing or start D1 writes',async()=>{
 for(const rotated of [false,true]){
  const f=fixture({rotated});
  const ok=await hit(STATUS,'GET',f.env);
  assert.equal(ok.status,200);
  const body=await responseBody(ok);
  assert.deepEqual(body,{mode:'isolated',assetWritesEnabled:false,
   authenticatedAcceptance:false,productionActivation:false,sourceSha:LEGACY_SHA});
  assert.deepEqual(f.sql,[MARKER_SQL]);
  assert.deepEqual(f.writes,[]);
  assert.equal(JSON.stringify(body).includes(f.env.SESSION_SECRET),false);
  assert.equal(JSON.stringify(body).includes(f.env.AUDIT_INTEGRITY_SECRET),false);
 }
});
test('same inert status after synthetic rotation does not constitute login or audit acceptance',async()=>{
 const before=fixture(),after=fixture({rotated:true});
 const a=await (await hit(STATUS,'GET',before.env)).json();
 const b=await (await hit(STATUS,'GET',after.env)).json();
 assert.deepEqual(a,b);
 assert.equal(a.authenticatedAcceptance,false);
 assert.equal(a.assetWritesEnabled,false);
 assert.equal(a.productionActivation,false);
 assert.equal(before.writes.length+after.writes.length,0);
});
test('block every asset, authentication and service route before even querying D1',async()=>{
 const paths=[
 '/api/corporate-assets','/api/corporate-assets/status',
 '/api/corporate-assets/schedule','/api/corporate-assets/11111111-1111-4111-8111-111111111111',
 '/api/corporate-assets/11111111-1111-4111-8111-111111111111/services',
 '/api/corporate-assets/11111111-1111-4111-8111-111111111111/history',
 '/api/auth/login','/api/auth/logout','/api/auth/me','/api/billing/status',
 '/api/corporate-assets-staging/status/','/api/corporate-assets-staging/STATUS'
 ];
 for(const rotated of [false,true])for(const path of paths)for(const method of ['GET','POST','PUT','DELETE']){
  const f=fixture({rotated}),r=await hit(path,method,f.env);
  assert.equal(r.status,403,method+' '+path);
  assert.deepEqual(await responseBody(r),{error:'staging_route_disabled'});
  assert.deepEqual(f.sql,[]);
  assert.deepEqual(f.writes,[]);
 }
});
test('block mutation verbs against the only allowed status path without touching D1',async()=>{
 for(const rotated of [false,true])for(const method of ['POST','PUT','PATCH','DELETE']){
  const f=fixture({rotated}),r=await hit(STATUS,method,f.env);
  assert.equal(r.status,403,method);
  assert.deepEqual(await responseBody(r),{error:'staging_route_disabled'});
  assert.deepEqual(f.sql,[]);
  assert.deepEqual(f.writes,[]);
 }
});
test('deny changed flags, wrong profile, production mode and invalid SHA before database access',async()=>{
 const changes=[
  v=>v.APP_ENV='production',v=>v.APP_ENV='development',
  v=>v.DEPLOYMENT_PROFILE='corporate-assets-authenticated-acceptance',
  v=>v.ASSETS_STAGING_WRITES_ENABLED='true',
  v=>v.THEBE_CORPORATE_ASSETS_ENABLED='true',
  v=>v.ASSETS_STAGING_WRITES_ENABLED=undefined,
  v=>v.THEBE_CORPORATE_ASSETS_ENABLED=undefined,
  v=>v.ASSETS_STAGING_SOURCE_SHA='invalid',
  v=>v.ASSETS_STAGING_SOURCE_SHA=undefined,
  v=>v.ASSETS_STAGING_D1_ID=undefined
 ];
 for(const change of changes)for(const rotated of [false,true]){
  const f=fixture({rotated}),env={...f.env};change(env);
  const r=await hit(STATUS,'GET',env);
  assert.equal(r.status,503);
  assert.deepEqual(await responseBody(r),{error:'staging_configuration_required'});
  assert.deepEqual(f.sql,[]);
  assert.deepEqual(f.writes,[]);
 }
});
test('wrong, missing, or unreadable isolated D1 marker never produces an OK status',async()=>{
 for(const options of [
  {marker:null},
  {marker:{database_id:PROD_D1,environment:'corporate-assets-isolated'}},
  {marker:{database_id:STAGING_D1,environment:'production'}},
  {marker:{database_id:STAGING_D1,environment:null}},
  {throwOnRead:true}
 ])for(const rotated of [false,true]){
  const f=fixture({...options,rotated});
  const r=await hit(STATUS,'GET',f.env);
  assert.equal(r.status,503);
  assert.deepEqual(await responseBody(r),{error:'staging_database_unqualified'});
  assert.deepEqual(f.sql,[MARKER_SQL]);
  assert.deepEqual(f.writes,[]);
 }
});
test('malformed or unavailable DB cannot disclose credentials or proceed',async()=>{
 for(const DB of [undefined,null,{}, {prepare:()=>{throw Error('unsafe DB')}}]){
  const f=fixture({rotated:true});
  const r=await hit(STATUS,'GET',{...f.env,DB});
  assert.equal(r.status,503);
  const body=await responseBody(r);
  assert.deepEqual(body,{error:'staging_database_unqualified'});
  const serialized=JSON.stringify(body);
  for(const secret of [OLD_SESSION,NEW_SESSION,OLD_AUDIT,NEW_AUDIT])
   assert.equal(serialized.includes(secret),false);
  assert.deepEqual(f.writes,[]);
 }
});
