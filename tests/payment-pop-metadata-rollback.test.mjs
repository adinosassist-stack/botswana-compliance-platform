import test from 'node:test';
import assert from 'node:assert/strict';
import {stagePopSubmission} from '../cloudflare/src/payment-pop-staging-service.js';
import {popServiceFixture,popFixtureId as id} from './helpers/payment-pop-service-fixture.mjs';
const opts={orderId:id,documentId:id,requestKey:'rollback-request-key-0001',bytes:new Uint8Array([137,80,78,71,13,10,26,10,1]),name:'receipt.png',contentType:'image/png'};
test('staging records pending-only POP metadata',async()=>{
 const f=popServiceFixture();try{const r=await stagePopSubmission(f.env,{...opts,session:f.session});assert.equal(r.scanStatus,'pending');assert.equal(r.subscriptionActivated,false);assert.deepEqual(f.counts(),{puts:1,deletes:0});assert.equal(f.sql.prepare('SELECT count(*) n FROM payment_pop_documents').get().n,1)}finally{f.close()}
});
test('failed POP metadata insertion removes newly quarantined object and retains failed admission',async()=>{
 const f=popServiceFixture();try{
  f.sql.exec("CREATE TRIGGER reject_pop_metadata BEFORE INSERT ON payment_pop_documents BEGIN SELECT RAISE(ABORT,'local metadata failure'); END");
  await assert.rejects(stagePopSubmission(f.env,{...opts,session:f.session}),/pop_metadata_write_failed/);
  assert.deepEqual(f.counts(),{puts:1,deletes:1});assert.equal(f.objects.size,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM payment_pop_documents').get().n,0);assert.equal(f.sql.prepare('SELECT state FROM payment_pop_upload_requests').get().state,'failed');
 }finally{f.close()}
});
test('lost commit acknowledgement recovers stored receipt without deleting the accepted object',async()=>{
 const f=popServiceFixture();try{
  const batch=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=async statements=>{await batch(statements);throw Error('lost acknowledgement')};
  const r=await stagePopSubmission(f.env,{...opts,session:f.session});assert.equal(r.documentId,id);assert.equal(r.replayed,true);assert.equal(f.objects.size,1);assert.equal(f.counts().deletes,0);assert.equal(f.sql.prepare('SELECT state FROM payment_pop_upload_requests').get().state,'stored');
 }finally{f.close()}
});
test('lost storage response keeps the reservation and refuses a second write on retry',async()=>{
 const f=popServiceFixture();try{
  const put=f.env.EVIDENCE.put.bind(f.env.EVIDENCE);f.env.EVIDENCE.put=async(...a)=>{await put(...a);throw Error('lost storage response')};
  await assert.rejects(stagePopSubmission(f.env,{...opts,session:f.session}),/lost storage response/);
  await assert.rejects(stagePopSubmission(f.env,{...opts,documentId:crypto.randomUUID(),session:f.session}),/pop_upload_in_progress/);
  assert.equal(f.counts().puts,1);assert.equal(f.objects.size,1);assert.equal(f.sql.prepare('SELECT state FROM payment_pop_upload_requests').get().state,'reserved');assert.equal(f.sql.prepare('SELECT count(*) n FROM payment_pop_documents').get().n,0);
 }finally{f.close()}
});
test('uncertain database outcome preserves the object and recovers on a later replay',async()=>{
 const f=popServiceFixture();try{
  const batch=f.env.DB.batch.bind(f.env.DB),prepare=f.env.DB.prepare.bind(f.env.DB);let uncertain=false;
  f.env.DB.batch=async statements=>{await batch(statements);uncertain=true;throw Error('lost commit acknowledgement')};
  f.env.DB.prepare=query=>{if(uncertain&&query.startsWith('SELECT state FROM payment_pop_upload_requests'))throw Error('database temporarily unavailable');return prepare(query)};
  await assert.rejects(stagePopSubmission(f.env,{...opts,session:f.session}),/pop_upload_reconciliation_required/);
  assert.equal(f.objects.size,1);assert.equal(f.counts().deletes,0);
  f.env.DB.batch=batch;f.env.DB.prepare=prepare;
  const replay=await stagePopSubmission(f.env,{...opts,documentId:crypto.randomUUID(),session:f.session});assert.equal(replay.documentId,id);assert.equal(replay.replayed,true);assert.equal(f.counts().puts,1);
 }finally{f.close()}
});
test('failed storage cleanup retains reserved admission and blocks duplicate storage',async()=>{
 const f=popServiceFixture();try{
  f.sql.exec("CREATE TRIGGER reject_pop_metadata BEFORE INSERT ON payment_pop_documents BEGIN SELECT RAISE(ABORT,'local metadata failure'); END");
  f.env.EVIDENCE.delete=async()=>{throw Error('storage unavailable')};
  await assert.rejects(stagePopSubmission(f.env,{...opts,session:f.session}),/pop_metadata_cleanup_required/);
  await assert.rejects(stagePopSubmission(f.env,{...opts,documentId:crypto.randomUUID(),session:f.session}),/pop_upload_in_progress/);
  assert.equal(f.objects.size,1);assert.equal(f.counts().puts,1);assert.equal(f.sql.prepare('SELECT state FROM payment_pop_upload_requests').get().state,'reserved');
 }finally{f.close()}
});
