import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {handleCorporateAssets} from '../cloudflare/src/corporate-assets.js';
test('local D1 atomically seals asset writes, enforces tenant FK and rolls back rejected audit',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'corporate-assets-fixture'}}));
 try{
  const DB=await mf.getD1Database('DB'),schema=readFileSync('cloudflare/schema.sql','utf8');
  await DB.prepare('CREATE TABLE tenants(id TEXT PRIMARY KEY)').run();await DB.prepare('CREATE TABLE users(id TEXT PRIMARY KEY)').run();
  for(const table of ['audit_events','audit_chain_state','audit_write_failures']){
   const sql=schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\([\\s\\S]*?\\);'))?.[0];assert.ok(sql,table);await DB.prepare(sql).run();
  }
  for(const sql of ['ALTER TABLE audit_events ADD COLUMN tenant_seq INTEGER','ALTER TABLE audit_events ADD COLUMN prev_hash TEXT','ALTER TABLE audit_events ADD COLUMN event_hash TEXT','ALTER TABLE audit_events ADD COLUMN integrity_version INTEGER',"ALTER TABLE audit_events ADD COLUMN write_source TEXT NOT NULL DEFAULT 'server'",'CREATE UNIQUE INDEX audit_tenant_seq_unique ON audit_events(tenant_id,tenant_seq) WHERE tenant_seq IS NOT NULL'])await DB.prepare(sql).run();
  for(const sql of splitSqliteMigrationStatements(readFileSync('cloudflare/schema/corporate-assets.sql','utf8')))await DB.prepare(sql).run();
  await DB.prepare("INSERT INTO tenants VALUES('a')").run();await DB.prepare("INSERT INTO tenants VALUES('b')").run();await DB.prepare("INSERT INTO users VALUES('a')").run();
  const env={DB,THEBE_CORPORATE_ASSETS_ENABLED:'true',AUDIT_INTEGRITY_SECRET:'local-assets-fixture-secret'};
  const id='11111111-1111-4111-8111-111111111111',body={id,name:'Workshop generator',category:'machinery',branch:'Palapye',serial:'G-1',acquisitionDate:'2026-01-01',acquisitionCostMinor:500000,bookValueMinor:450000,status:'active'};
  const call=(path,method,data)=>handleCorporateAssets({request:new Request('https://thebedesk.com/api/corporate-assets'+path,{method,body:JSON.stringify(data)}),env,auth:{tenant_id:'a',user_id:'a',role:'owner'},readJson:r=>r.json()});
  assert.equal((await call('','POST',body)).status,201);
  await DB.prepare("CREATE TRIGGER reject_asset_change BEFORE INSERT ON audit_events WHEN NEW.event_type='CORPORATE_ASSET_UPDATED' BEGIN SELECT RAISE(ABORT,'offline-test'); END").run();
  assert.equal((await call('/'+id,'PUT',{...body,revision:1,bookValueMinor:1})).status,503);
  assert.equal((await DB.prepare('SELECT revision,book_value_minor FROM corporate_assets').first()).book_value_minor,450000);
  await DB.prepare('DROP TRIGGER reject_asset_change').run();
  const edits=await Promise.all([call('/'+id,'PUT',{...body,revision:1,branch:'Maun'}),call('/'+id,'PUT',{...body,revision:1,branch:'Gaborone'})]);assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM audit_events').first()).n,2);
  assert.equal((await DB.prepare('SELECT event_count FROM audit_chain_state').first()).event_count,2);
  await assert.rejects(DB.prepare("INSERT INTO corporate_asset_services(id,tenant_id,asset_id,kind,serviced_on,due_on,cost_minor,description) VALUES('service','b',?,'repair','2026-01-01','2026-02-01',0,'Repair')").bind(id).run());

  // Exercise the same runtime handler against real local D1, not a mock list.
  const scoped=(tenant_id,role,path,method='GET',data)=>handleCorporateAssets({
   request:new Request('https://thebedesk.com/api/corporate-assets'+path,{method,...(data?{body:JSON.stringify(data)}:{})}),
   env,auth:{tenant_id,user_id:'a',role},readJson:r=>r.json()
  });
  const ownerListing=await scoped('a','owner','');
  assert.equal(ownerListing.status,200);
  assert.deepEqual((await ownerListing.json()).items.map(a=>a.id),[id]);
  const otherTenantListing=await scoped('b','owner','');
  assert.equal(otherTenantListing.status,200);
  assert.deepEqual((await otherTenantListing.json()).items,[],'tenant B cannot enumerate tenant A');
  assert.equal((await scoped('b','owner','/'+id+'/history')).status,404,'tenant B cannot read asset history');
  assert.equal((await scoped('a','reviewer','')).status,403,'reviewer cannot view register');
  assert.equal((await handleCorporateAssets({request:new Request('https://thebedesk.com/api/corporate-assets'),env,auth:null})).status,401,'anonymous requests denied');
  assert.equal((await scoped('a','manager','/'+id,'PUT',{...body,revision:2,status:'written_off'})).status,403,'manager cannot retire asset');
  assert.equal((await scoped('a','manager','/'+id,'PUT',{...body,revision:2,bookValueMinor:1})).status,403,'manager cannot modify book value');
  const disabled=await handleCorporateAssets({request:new Request('https://thebedesk.com/api/corporate-assets'),env:{...env,THEBE_CORPORATE_ASSETS_ENABLED:'false'},auth:{tenant_id:'a',user_id:'a',role:'owner'}});
  assert.equal(disabled.status,404,'disabled feature fails closed despite a valid schema');
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id=?').bind('b').first()).count,0,'no cross-tenant audit writes');
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM corporate_assets WHERE tenant_id=?').bind('a').first()).count,1,'denied writes left asset intact');
  const auditRows=await DB.prepare('SELECT tenant_seq,event_hash,prev_hash FROM audit_events WHERE tenant_id=? ORDER BY tenant_seq').bind('a').all();
  assert.equal(auditRows.results.length,2);
  assert.equal(auditRows.results[0].tenant_seq,1);
  assert.equal(auditRows.results[1].tenant_seq,2);
  assert.equal(auditRows.results[1].prev_hash,auditRows.results[0].event_hash,'sealed event hash chain links successful writes');

 }finally{await mf.dispose()}
});
