import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {setSubscriptionAccess} from '../cloudflare/src/platform-subscription-controls.js';
import {appendSealedAuditEvent} from '../cloudflare/src/audit-lineage-writer.js';

test('local D1 atomically commits subscription access and sealed completion evidence',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'subscription-audit-regression'}}));
 try{
  const DB=await mf.getD1Database('DB');
  for(const sql of [
   'CREATE TABLE tenants(id TEXT PRIMARY KEY)',
   'CREATE TABLE subscriptions(tenant_id TEXT PRIMARY KEY,plan TEXT,status TEXT,provider TEXT,current_period_ends_at TEXT,updated_at TEXT)',
   'CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT,order_type TEXT,provider TEXT,status TEXT,metadata_json TEXT)',
   'CREATE TABLE payment_fulfillments(payment_order_id TEXT,tenant_id TEXT,fulfillment_status TEXT)',
   fs.readFileSync('cloudflare/schema.sql','utf8').match(/CREATE TABLE IF NOT EXISTS audit_events\([\s\S]*?\);/)[0]
  ])await DB.prepare(sql).run();
  await DB.exec(fs.readFileSync('cloudflare/migrations/004_v56_audit_lineage.sql','utf8').split('CREATE TABLE IF NOT EXISTS audit_integrity_checks')[0].replaceAll('\n',' '));
  await DB.batch([
   DB.prepare("INSERT INTO tenants VALUES('client')"),
   DB.prepare("INSERT INTO subscriptions VALUES('client','business','active','manual_bank','2099-01-01',NULL)"),
   DB.prepare(`INSERT INTO payment_orders VALUES('paid-order','client','subscription','manual_bank','paid','{"plan":"business"}')`),
   DB.prepare("INSERT INTO payment_fulfillments VALUES('paid-order','client','applied')")
  ]);
  const env={DB,AUDIT_INTEGRITY_SECRET:'local-d1-regression-only'};
  const auth={tenant_id:'platform',user_id:'billing-owner'};
  const body={tenantId:'client',enabled:false,expectedStatus:'active',expectedPeriod:'2099-01-01',reason:'Designated local fixture'};
  const writeAudit=(_env,tenantId,userId,eventType,eventData)=>appendSealedAuditEvent(_env,{tenantId,actorUserId:userId,eventType,entityType:'user',entityId:userId,eventData});
  const change=(overrides={},environment=env,audit=writeAudit)=>setSubscriptionAccess({env:environment,auth,body:{...body,...overrides},writeAudit:audit});
  const state=()=>DB.prepare('SELECT status FROM subscriptions').first();
  const completed=async()=>(await DB.prepare("SELECT count(*) n FROM audit_events WHERE event_type='SUBSCRIPTION_ACCESS_CHANGED'").first()).n;

  for(const trigger of [
   "CREATE TRIGGER fail_completion BEFORE INSERT ON audit_events WHEN NEW.event_type='SUBSCRIPTION_ACCESS_CHANGED' BEGIN SELECT RAISE(ABORT,'completion unavailable'); END",
   "CREATE TRIGGER fail_completion BEFORE UPDATE ON audit_chain_state WHEN EXISTS(SELECT 1 FROM audit_events WHERE tenant_seq=NEW.event_count AND event_type='SUBSCRIPTION_ACCESS_CHANGED') BEGIN SELECT RAISE(ABORT,'chain unavailable'); END"
  ]){
   await DB.prepare(trigger).run();
   await assert.rejects(change(),/audit_write_failed/);
   assert.equal((await state()).status,'active');assert.equal(await completed(),0);
   const head=await DB.prepare('SELECT event_count FROM audit_chain_state').first();
   assert.equal(head.event_count,(await DB.prepare('SELECT count(*) n FROM audit_events').first()).n);
   await DB.prepare('DROP TRIGGER fail_completion').run();
  }
  const results=await Promise.all([change(),change()]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await state()).status,'paused');assert.equal(await completed(),1);
  assert.equal((await change({expectedStatus:'paused'})).body.unchanged,true);
  assert.equal(await completed(),1);

  // A refund between preflight and commit must not leave a completion event.
  const raced=await change({enabled:true,expectedStatus:'paused'},env,async(...args)=>{
   await writeAudit(...args);
   await DB.prepare("UPDATE payment_orders SET status='refunded'").run();
  });
  assert.equal(raced.status,409);assert.equal((await state()).status,'paused');assert.equal(await completed(),1);
 }finally{await mf.dispose()}
});
