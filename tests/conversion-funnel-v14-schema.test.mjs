import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {installShadowTelemetrySchema,sqliteTelemetryEnv} from './helpers/agent-shadow-telemetry.mjs';
import {recordEvent,recordRegistrationSuccess,recordWorkspaceReached} from '../cloudflare/src/conversion-funnel-governance.js';

const conversionId='12345678-1234-1234-1234-123456789abc';
function request(path,method='GET'){
  return new Request('https://thebedesk.com'+path,{method,headers:{cookie:'thebe_cv='+conversionId}});
}
function fixture(){
  const db=new DatabaseSync(':memory:');
  installShadowTelemetrySchema(db);
  const {DB}=sqliteTelemetryEnv(db);
  return {db,env:{DB},count:()=>db.prepare('SELECT count(*) n FROM audit_events').get().n};
}
test('generic 202 registration acceptance is not proof of a new signup',async()=>{
  const f=fixture();
  try{
    const response=new Response('{"ok":true}',{status:202});
    assert.equal(await recordRegistrationSuccess({request:request('/api/auth/register','POST'),path:'/api/auth/register',env:f.env,response}),response);
    assert.equal(f.count(),0,'enumeration-safe acceptance alone must not become a successful signup');
  }finally{f.db.close()}
});
test('real schema deduplicates conversion stages without touching customer state',async()=>{
  const f=fixture();
  try{
    f.db.exec("INSERT INTO tenants(id,name) VALUES('customer','Customer'); INSERT INTO users(id,email) VALUES('owner','owner@example.invalid'); INSERT INTO memberships(tenant_id,user_id,role) VALUES('customer','owner','owner'); INSERT INTO subscriptions(tenant_id,plan,status) VALUES('customer','business','trialing');");
    const before=f.db.prepare('SELECT * FROM subscriptions').all();
    const results=await Promise.all(Array.from({length:12},()=>recordEvent(f.env,{conversionId,stage:'market_view',source:'hero',plan:'business',path:'/'})));
    assert(results.every(Boolean));
    assert.equal(f.count(),1);
    const row=f.db.prepare('SELECT * FROM audit_events').get();
    assert.equal(row.tenant_id,'public-market');
    assert.equal(row.actor_user_id,null);
    assert.equal(row.event_type,'MARKETING_MARKET_VIEW');
    assert.equal(JSON.parse(row.event_data).source,'hero');
    assert.deepEqual(f.db.prepare('SELECT * FROM subscriptions').all(),before);
    assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n,1);
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.db.close()}
});
test('workspace completion requires a prior signup and an HTML workspace response',async()=>{
  const f=fixture();
  try{
    const req=request('/app/'),html=()=>new Response('<main>Workspace</main>',{headers:{'content-type':'text/html','x-test':'preserved'}});
    const first=html();
    assert.equal(await recordWorkspaceReached({request:req,path:'/app/',env:f.env,response:first}),first);
    assert.equal(f.count(),0);
    await recordEvent(f.env,{conversionId,stage:'registration_success',path:'/auth/'});
    const json=new Response('{}',{headers:{'content-type':'application/json'}});
    assert.equal(await recordWorkspaceReached({request:req,path:'/app/',env:f.env,response:json}),json);
    assert.equal(f.count(),1);
    const response=await recordWorkspaceReached({request:req,path:'/app/',env:f.env,response:html()});
    assert.equal(response.headers.get('x-test'),'preserved');
    assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal(await response.text(),'<main>Workspace</main>');
    assert.equal(f.count(),2);
  }finally{f.db.close()}
});
