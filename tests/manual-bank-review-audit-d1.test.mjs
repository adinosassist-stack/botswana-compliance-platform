import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {appendSealedAuditEvent} from '../cloudflare/src/audit-lineage-writer.js';

const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const start=worker.indexOf('const manualAdminMatch=url.pathname.match(');
const end=worker.indexOf('if(url.pathname==="/api/payments/ai-credit-checkout"',start);
assert(start>0&&end>start);
const route='(async()=>{'+worker.slice(start,end)+'})()';
const sid='11111111-1111-4111-8111-111111111111';

test('actual manual-review SQL rolls back completion failures and resumes a paid order once',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'manual-review-audit-regression'}}));
 try{
  const DB=await mf.getD1Database('DB');
  for(const sql of [
   'CREATE TABLE tenants(id TEXT PRIMARY KEY)',
   'CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT,amount_bwp REAL,status TEXT,order_type TEXT,provider TEXT,provider_payment_id TEXT,metadata_json TEXT)',
   'CREATE TABLE subscriptions(tenant_id TEXT PRIMARY KEY,plan TEXT,status TEXT,provider TEXT,current_period_ends_at TEXT)',
   'CREATE TABLE payment_fulfillments(payment_order_id TEXT,tenant_id TEXT,order_type TEXT,fulfillment_status TEXT)',
   fs.readFileSync('cloudflare/schema.sql','utf8').match(/CREATE TABLE IF NOT EXISTS audit_events\([\s\S]*?\);/)[0],
   ...fs.readFileSync('cloudflare/migrations/050_v115_manual_bank_subscriptions.sql','utf8').match(/CREATE TABLE IF NOT EXISTS \w+\([\s\S]*?\);/g)
  ])await DB.prepare(sql).run();
  await DB.exec(fs.readFileSync('cloudflare/migrations/004_v56_audit_lineage.sql','utf8').split('CREATE TABLE IF NOT EXISTS audit_integrity_checks')[0].replaceAll('\n',' '));
  const env={DB,AUDIT_INTEGRITY_SECRET:'local-only-not-production'};
  const audit=(environment,tenantId,actorUserId,eventType,eventData)=>appendSealedAuditEvent(environment,{tenantId,actorUserId,eventType,entityType:'user',entityId:actorUserId,eventData});
  let settlements=0;
  const run=(action='approve',writeAudit=audit)=>vm.runInNewContext(route,{
   url:new URL('https://example.invalid/api/platform/billing/manual-payments/'+sid+'/'+action),req:{method:'POST'},a:{role:'owner',user_id:'admin'},env,
   roleAllowed:()=>true,platformBillingAdmin:()=>true,
   readJson:async()=>({bankFundsConfirmed:true,bankAmountMatched:true,bankTransactionMatched:true,reason:'Not received in company bank'}),
   json:(body,status=200)=>({body,status}),boundedReportText:(v,n)=>String(v).slice(0,n),safeJson:JSON.parse,
   id:()=>crypto.randomUUID(),writeAudit,appendSealedAuditEvent,
   applyVerifiedPaymentOrder:async()=>{
    settlements++;
    await DB.batch([
     DB.prepare("UPDATE payment_orders SET status='paid',provider_payment_id='BANK-123'"),
     DB.prepare("UPDATE subscriptions SET status='active'"),
     DB.prepare("INSERT INTO payment_fulfillments VALUES('order','client','subscription','applied')")
    ]);
    return {ok:true};
   }
  });
  const reset=async()=>{
   for(const table of ['manual_payment_events','manual_payment_submissions','payment_fulfillments','subscriptions','payment_orders','audit_events','audit_chain_state','audit_write_failures','tenants'])await DB.prepare('DELETE FROM '+table).run();
   await DB.batch([
    DB.prepare("INSERT INTO tenants VALUES('client')"),
    DB.prepare(`INSERT INTO payment_orders VALUES('order','client',149,'pending','subscription','manual_bank',NULL,'{"plan":"business"}')`),
    DB.prepare("INSERT INTO subscriptions VALUES('client','business','inactive','manual_bank','2099-01-01')"),
    DB.prepare("INSERT INTO manual_payment_submissions(id,payment_order_id,tenant_id,bank_reference) VALUES(?,'order','client','BANK-123')").bind(sid)
   ]);settlements=0;
  };
  const review=()=>DB.prepare('SELECT status,reviewed_by_user_id FROM manual_payment_submissions').first();
  const count=async(table,where='1=1')=>(await DB.prepare('SELECT count(*) n FROM '+table+' WHERE '+where).first()).n;
  const checkChain=async()=>{
   const head=await DB.prepare('SELECT event_count FROM audit_chain_state').first();
   assert.equal(head?.event_count||0,await count('audit_events'));
  };
  await reset();
  await assert.rejects(run('approve',async()=>{throw Error('audit_write_failed')}),/audit_write_failed/);
  assert.equal(settlements,0);assert.equal((await review()).status,'submitted');

  for(const trigger of [
   "CREATE TRIGGER refuse_completion BEFORE INSERT ON manual_payment_events BEGIN SELECT RAISE(ABORT,'receipt failure'); END",
   "CREATE TRIGGER refuse_completion BEFORE INSERT ON audit_events WHEN NEW.event_type='MANUAL_PAYMENT_APPROVED' BEGIN SELECT RAISE(ABORT,'audit failure'); END",
   "CREATE TRIGGER refuse_completion BEFORE UPDATE ON audit_chain_state WHEN EXISTS(SELECT 1 FROM audit_events WHERE tenant_seq=NEW.event_count AND event_type='MANUAL_PAYMENT_APPROVED') BEGIN SELECT RAISE(ABORT,'chain failure'); END"
  ]){
   await reset();await DB.prepare(trigger).run();
   await assert.rejects(run(),/audit_write_failed/);
   assert.equal((await review()).status,'reviewing');assert.equal((await review()).reviewed_by_user_id,'admin');
   assert.equal(await count('manual_payment_events'),0);assert.equal(await count('audit_events',"event_type='MANUAL_PAYMENT_APPROVED'"),0);
   assert.equal(settlements,1);await checkChain();
   await DB.prepare('DROP TRIGGER refuse_completion').run();
   assert.equal((await run()).status,200);assert.equal(settlements,1,'review recovery must not extend paid access again');
   assert.equal((await review()).status,'approved');assert.equal(await count('manual_payment_events'),1);
   assert.equal(await count('audit_events',"event_type='MANUAL_PAYMENT_APPROVED'"),1);await checkChain();
   assert.equal((await run()).status,409);assert.equal(settlements,1);
  }
  // Refund after the persisted-settlement read, immediately before atomic completion.
  await reset();
  env.DB={prepare:sql=>DB.prepare(sql),batch:async statements=>{
   if(statements.length===4)await DB.prepare("UPDATE payment_orders SET status='refunded'").run();
   return DB.batch(statements);
  }};
  const raced=await run();env.DB=DB;
  assert.equal(raced.status,409);assert.equal((await review()).status,'reviewing');
  assert.equal(await count('manual_payment_events'),0);
  assert.equal(await count('audit_events',"event_type='MANUAL_PAYMENT_APPROVED'"),0);await checkChain();
  // Competing approvers cannot settle twice or emit duplicate completion receipts.
  await reset();
  const concurrent=await Promise.all([run(),run()]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  assert.equal(settlements,1);assert.equal(await count('manual_payment_events'),1);
  assert.equal(await count('audit_events',"event_type='MANUAL_PAYMENT_APPROVED'"),1);await checkChain();

  for(const trigger of [
   "CREATE TRIGGER refuse_completion BEFORE INSERT ON manual_payment_events BEGIN SELECT RAISE(ABORT,'receipt failure'); END",
   "CREATE TRIGGER refuse_completion BEFORE INSERT ON audit_events WHEN NEW.event_type='MANUAL_PAYMENT_REJECTED' BEGIN SELECT RAISE(ABORT,'audit failure'); END",
   "CREATE TRIGGER refuse_completion BEFORE INSERT ON audit_chain_state BEGIN SELECT RAISE(ABORT,'chain failure'); END"
  ]){
   await reset();await DB.prepare(trigger).run();
   await assert.rejects(run('reject'),/audit_write_failed/);
   assert.equal((await review()).status,'submitted');assert.equal(await count('manual_payment_events'),0);assert.equal(await count('audit_events'),0);
   await DB.prepare('DROP TRIGGER refuse_completion').run();
   assert.equal((await run('reject')).status,200);assert.equal((await review()).status,'rejected');
   assert.equal(settlements,0);assert.equal(await count('manual_payment_events'),1);await checkChain();
  }
  await assert.rejects(appendSealedAuditEvent(env,{tenantId:'client',eventType:'INVALID',completionReceipt:DB.prepare('SELECT 1')}),/audit_receipt_requires_mutation/);
 }finally{await mf.dispose()}
});
