import test from 'node:test';
import assert from 'node:assert/strict';
import {stagePopSubmission} from '../cloudflare/src/payment-pop-staging-service.js';
import {popServiceFixture,popFixtureId as id} from './helpers/payment-pop-service-fixture.mjs';
const opts={orderId:id,documentId:id,requestKey:'service-request-key-0001',bytes:new Uint8Array([137,80,78,71,13,10,26,10,1]),name:'receipt.png',contentType:'image/png'};
test('authenticated tenant owner can stage a receipt without activating plan',async()=>{
 const f=popServiceFixture();try{
  const result=await stagePopSubmission(f.env,{...opts,session:f.session});
  assert.equal(f.counts().puts,1);assert.equal(result.scanStatus,'pending');assert.equal(result.reviewable,false);assert.equal(result.bankFundsConfirmed,false);assert.equal(result.subscriptionActivated,false);
  assert.equal(f.sql.prepare('SELECT state FROM payment_pop_upload_requests').get().state,'stored');
 }finally{f.close()}
});
test('unauthenticated, nonowner, disabled and invalid files never write',async()=>{
 const f=popServiceFixture();try{
  await assert.rejects(stagePopSubmission(f.env,{...opts,session:{...f.session,role:'manager'}}),/forbidden/);
  await assert.rejects(stagePopSubmission(f.env,{...opts,session:null}),/unauthenticated/);
  await assert.rejects(stagePopSubmission(f.env,{...opts,name:'receipt.exe',session:f.session}),/invalid_pop_type/);
  f.env.POP_UPLOAD_STAGING_ENABLED='false';await assert.rejects(stagePopSubmission(f.env,{...opts,session:f.session}),/disabled/);
  assert.equal(f.counts().puts,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM payment_pop_upload_requests').get().n,0);
 }finally{f.close()}
});
