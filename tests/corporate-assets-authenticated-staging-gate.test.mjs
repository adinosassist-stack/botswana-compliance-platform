import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorporateAssetsAuthenticatedStagingEntry} from '../cloudflare/src/corporate-assets-authenticated-staging-entry.js';
import {ASSET_STAGING_REQUIRED_COLUMNS} from '../cloudflare/src/corporate-assets-staging-schema-preflight.js';
const id='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const origin='https://assets-staging.thebedesk.com';
const env={APP_ENV:'staging',DEPLOYMENT_PROFILE:'corporate-assets-authenticated-acceptance',ASSETS_STAGING_AUTH_ACCEPTANCE_ENABLED:'true',
 THEBE_CORPORATE_ASSETS_ENABLED:'true',ASSETS_STAGING_WRITES_ENABLED:'true',ASSETS_STAGING_SOURCE_SHA:'a'.repeat(40),ASSETS_STAGING_D1_ID:id,
 PUBLIC_ORIGIN:origin,PUBLIC_APP_URL:origin,SESSION_SECRET:'synthetic-only',AUDIT_INTEGRITY_SECRET:'synthetic-only',
 DB:{prepare:sql=>sql.includes('staging_identity')?{first:async()=>({database_id:id,environment:'corporate-assets-isolated'})}:{all:async()=>({results:(ASSET_STAGING_REQUIRED_COLUMNS[sql.slice('PRAGMA table_info('.length,-1)]||[]).map(name=>({name}))})}}};
const hit=(app,path,method='GET',vars=env)=>app.fetch(new Request(origin+path,{method}),vars);
test('acceptance staging is disabled by default and demands exact binding, secrets and origin',async()=>{
 const app=createCorporateAssetsAuthenticatedStagingEntry({fetch:()=>Response.json({ok:true})});
 for(const vars of [{...env,ASSETS_STAGING_AUTH_ACCEPTANCE_ENABLED:'false'},{...env,ASSETS_STAGING_WRITES_ENABLED:'false'},{...env,THEBE_CORPORATE_ASSETS_ENABLED:'false'},
  {...env,SESSION_SECRET:undefined},{...env,APP_ENV:'production'},{...env,ASSETS_STAGING_SOURCE_SHA:'wrong'}])
  assert.equal((await hit(app,'/api/corporate-assets','GET',vars)).status,503);
 assert.equal((await app.fetch(new Request('https://production.thebedesk.com/api/corporate-assets'),env)).status,403);
 assert.equal((await hit(app,'/api/corporate-assets?__thebe_api_path=%2Fapi%2Fauth%2Flogin')).status,403);
 assert.equal((await hit(app,'/api/corporate-assets','GET',{...env,DB:{prepare:()=>({first:async()=>({database_id:'wrong'})})}})).status,503);
 assert.equal((await hit(app,'/api/corporate-assets','GET',{...env,DB:{prepare:sql=>sql.includes('staging_identity')?{first:async()=>({database_id:id,environment:'corporate-assets-isolated'})}:{all:async()=>({results:[]})}}})).status,503,'incomplete auth schema blocks delegation');
});
test('only auth and corporate asset paths delegate, with narrowed runtime',async()=>{
 const called=[];const app=createCorporateAssetsAuthenticatedStagingEntry({fetch:(req,runtime)=>{called.push({path:new URL(req.url).pathname,method:req.method,runtime});return Response.json({ok:true})}});
 const routes=[['/api/auth/me','GET'],['/api/auth/login','POST'],['/api/auth/logout','POST'],['/api/corporate-assets','GET'],
  ['/api/corporate-assets','POST'],['/api/corporate-assets/status','GET'],['/api/corporate-assets/schedule','GET'],
  ['/api/corporate-assets/11111111-1111-4111-8111-111111111111','PUT'],
  ['/api/corporate-assets/11111111-1111-4111-8111-111111111111/history','GET'],
  ['/api/corporate-assets/11111111-1111-4111-8111-111111111111/services','POST']];
 for(const [path,method] of routes)assert.equal((await hit(app,path,method)).status,200,path);
 for(const [path,method] of [['/api/auth/register','POST'],['/api/state','POST'],['/api/billing/status','GET'],['/api/corporate-assets','DELETE'],['/api/corporate-assets/not-an-id','PUT']])
  assert.equal((await hit(app,path,method)).status,403,path);
 assert.equal(called.length,routes.length);
 assert.equal(called[0].runtime.DB,env.DB);assert.equal(called[0].runtime.THEBE_CORPORATE_ASSETS_ENABLED,'true');assert.equal(called[0].runtime.ASSETS_STAGING_WRITES_ENABLED,'true');
 assert.equal(called[0].runtime.REGISTRATION_MODE,'hold');assert.equal(called[0].runtime.POP_UPLOAD_STAGING_ENABLED,'false');
 assert.equal(called[0].runtime.ASSETS_STAGING_AUTH_ACCEPTANCE_ENABLED,undefined);
});
