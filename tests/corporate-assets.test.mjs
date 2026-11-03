import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {popSqliteAdapter} from './helpers/payment-pop-service-fixture.mjs';
import {handleCorporateAssets,validateCorporateAsset,validateCorporateService} from '../cloudflare/src/corporate-assets.js';
const aid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const asset={id:aid,name:'Delivery truck',category:'fleet',branch:'Gaborone',serial:'TRUCK-1',custodian:'Dispatch team',acquisitionDate:'2026-01-15',acquisitionCostMinor:20000000,bookValueMinor:19000000,status:'active'};
const service={id:aid,kind:'service',servicedOn:'2026-01-01',dueOn:'2026-11-15',costMinor:25000,provider:'Garage',description:'Routine service'};
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON;'+readFileSync('cloudflare/schema.sql','utf8'));sql.exec(readFileSync('cloudflare/schema/corporate-assets.sql','utf8'));
 for(const id of ['a','b']){sql.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run(id,id);sql.prepare('INSERT INTO users(id,email) VALUES(?,?)').run(id,id+'@example.invalid')}
 const env={DB:popSqliteAdapter(sql),THEBE_CORPORATE_ASSETS_ENABLED:'true',AUDIT_INTEGRITY_SECRET:'offline-assets-audit-secret'};
 const call=(path='',method='GET',body=null,auth={tenant_id:'a',user_id:'a',role:'owner'})=>handleCorporateAssets({request:new Request('https://thebedesk.com/api/corporate-assets'+path,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})}),env,auth,readJson:r=>r.json()});
 return {sql,env,call,close:()=>sql.close()};
}
test('asset and service validation rejects malformed money, dates and caller scope',()=>{
 assert.ok(validateCorporateAsset(asset));assert.ok(validateCorporateService(service));
 for(const patch of [{tenant_id:'b'},{bookValueMinor:'100'},{acquisitionCostMinor:1.5},{bookValueMinor:-1},{acquisitionDate:'2026-02-30'},{category:'injected'},{name:' '},{branch:'x'.repeat(101)}])assert.equal(validateCorporateAsset({...asset,...patch}),null);
 for(const patch of [{tenantId:'b'},{dueOn:'2025-01-01'},{costMinor:NaN},{provider:'\nsecret'},{servicedOn:'2026-02-30'}])assert.equal(validateCorporateService({...service,...patch}),null);
});
test('feature flag and role fail closed without storage access',async()=>{
 const request=new Request('https://thebedesk.com/api/corporate-assets');
 for(const [env,auth,expected] of [[{},null,401],[{},{tenant_id:'a',user_id:'a',role:'auditor'},403],[{},{tenant_id:'a',user_id:'a',role:'owner'},404]])assert.equal((await handleCorporateAssets({request,env,auth})).status,expected);
});
test('create, edit, history and service are tenant scoped and sealed',async()=>{
 const f=fixture();try{
  assert.equal((await f.call('','POST',asset)).status,201);
  const list=await (await f.call()).json();assert.equal(list.items.length,1);assert.equal(list.summary.bookValueMinor,19000000);
  assert.equal((await f.call('','GET',null,{tenant_id:'b',user_id:'b',role:'owner'})).status,200);
  assert.equal((await (await f.call('','GET',null,{tenant_id:'b',user_id:'b',role:'owner'})).json()).items.length,0);
  assert.equal((await f.call('/'+aid,'PUT',{...asset,revision:1,branch:'Palapye'})).status,200);
  assert.equal((await f.call('/'+aid,'PUT',{...asset,revision:1})).status,409);
  assert.equal((await f.call('/'+aid+'/services','POST',service)).status,201);
  assert.equal((await f.call('/'+aid+'/services','POST',{...service,id:other}, {tenant_id:'b',user_id:'b',role:'owner'})).status,409);
  assert.equal((await f.call('/'+aid+'/history','GET',null,{tenant_id:'b',user_id:'b',role:'owner'})).status,404);
  const history=await (await f.call('/'+aid+'/history')).json();assert.equal(history.items.length,3);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM audit_events WHERE event_hash IS NOT NULL').get().n,3);
 }finally{f.close()}
});
test('missing audit secret or failed audit insert rolls back asset mutation',async()=>{
 const f=fixture();try{
  delete f.env.AUDIT_INTEGRITY_SECRET;assert.equal((await f.call('','POST',asset)).status,503);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM corporate_assets').get().n,0);
  f.env.AUDIT_INTEGRITY_SECRET='offline';
  f.sql.exec("CREATE TRIGGER reject_asset_audit BEFORE INSERT ON audit_events WHEN NEW.entity_type='corporate_asset' BEGIN SELECT RAISE(ABORT,'blocked'); END");
  assert.equal((await f.call('','POST',asset)).status,503);assert.equal(f.sql.prepare('SELECT count(*) n FROM corporate_assets').get().n,0);
 }finally{f.close()}
});
test('duplicate serial is scoped to tenant and managers cannot retire or revalue',async()=>{
 const f=fixture();try{
  await f.call('','POST',asset);assert.equal((await f.call('','POST',{...asset,id:other,serial:'truck-1'})).status,409);
  assert.equal((await f.call('','POST',{...asset,id:other},{tenant_id:'b',user_id:'b',role:'owner'})).status,201);
  for(const patch of [{status:'written_off'},{bookValueMinor:1},{acquisitionCostMinor:1}])assert.equal((await f.call('/'+aid,'PUT',{...asset,...patch,revision:1},{tenant_id:'a',user_id:'a',role:'manager'})).status,403);
  assert.equal((await f.call('/'+aid,'PUT',{...asset,branch:'Maun',revision:1},{tenant_id:'a',user_id:'a',role:'manager'})).status,200);
 }finally{f.close()}
});
test('latest renewal replaces old schedule while retaining audit history',async()=>{
 const f=fixture();try{
  await f.call('','POST',asset);await f.call('/'+aid+'/services','POST',service);
  await f.call('/'+aid+'/services','POST',{...service,id:other,dueOn:'2099-01-01'});
  const schedule=await (await f.call('/schedule')).json();assert.equal(schedule.items.length,1);assert.equal(schedule.items[0].due_on,'2099-01-01');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM corporate_asset_services').get().n,2);
 }finally{f.close()}
});
test('missing schema is unavailable and invalid cursors do not become SQL',async()=>{
 const f=fixture();try{assert.equal((await f.call('?after=bad')).status,400);f.sql.exec('DROP TABLE corporate_asset_services');assert.equal((await f.call()).status,503)}finally{f.close()}
});
test('concurrent stale updates commit at most once with exactly one update audit',async()=>{
 const f=fixture();try{
  await f.call('','POST',asset);const results=await Promise.all([f.call('/'+aid,'PUT',{...asset,branch:'Maun',revision:1}),f.call('/'+aid,'PUT',{...asset,branch:'Palapye',revision:1})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE event_type='CORPORATE_ASSET_UPDATED'").get().n,1);
 }finally{f.close()}
});
test('keyset pages are bounded and totals cover the tenant rather than the page',async()=>{
 const f=fixture();try{
  const insert=f.sql.prepare("INSERT INTO corporate_assets(id,tenant_id,name,category,branch,acquisition_date,acquisition_cost_minor,book_value_minor,status) VALUES(?,'a','Equipment','it','Gaborone','2026-01-01',100,100,'active')");
  for(let i=1;i<=101;i++)insert.run(i.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111');
  const first=await (await f.call()).json();assert.equal(first.items.length,100);assert.equal(first.summary.total,101);assert.equal(first.summary.bookValueMinor,10100);assert.ok(first.nextCursor);
  const second=await (await f.call('?after='+first.nextCursor)).json();assert.equal(second.items.length,1);assert.equal(second.nextCursor,null);assert.ok(!first.items.some(x=>x.id===second.items[0].id));
 }finally{f.close()}
});
