import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyVersionedR2Candidate} from '../scripts/verify-versioned-r2-candidates-protected.mjs';
const base={GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',
 GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
 VERSIONED_CONFIRM:'QUALIFY_PRIVATE_BACKUP_CANDIDATES',EXPECTED_SHA:'a'.repeat(40),
 GITHUB_SHA:'a'.repeat(40),PRIVATE_BACKUP_ACCOUNT_ID:'ddd23cab31928a4bb3d4998df9b26d1d',
 PRIVATE_BACKUP_CLOUDFLARE_TOKEN:'synthetic-only',VERSIONED_RUN_ID:'41709222476'};
const reject=async(e)=>{let calls=0;await assert.rejects(
 verifyVersionedR2Candidate(e,{fetchImpl:async()=>{calls++;throw Error('unexpected request')}}),
 /versioned_r2_readonly_hold_authority/);assert.equal(calls,0)};
test('rejects unapproved candidates, source drift, missing token, wrong event and confirmation before network',async()=>{
 for(const patch of [
  {VERSIONED_RUN_ID:'41348652986'},{VERSIONED_RUN_ID:'41709222476/../../foo'},
  {GITHUB_SHA:'b'.repeat(40)},{GITHUB_REF:'refs/heads/feature'},
  {GITHUB_EVENT_NAME:'pull_request'},{VERSIONED_CONFIRM:'RESTORE_APPROVED_BACKUP'},
  {PRIVATE_BACKUP_CLOUDFLARE_TOKEN:''},{PRIVATE_BACKUP_ACCOUNT_ID:'b'.repeat(32)}
 ])await reject({...base,...patch});
});
test('privacy refusal prevents any private SQL fetch',async()=>{
 const paths=[];const fetchImpl=async(url,o)=>{paths.push({url,method:o.method});
  return Response.json({success:true,result:url.endsWith('/domains/managed')?{enabled:true}:{domains:[]}})};
 await assert.rejects(verifyVersionedR2Candidate(base,{fetchImpl}),/bucket_privacy_unverified/);
 assert.equal(paths.length,2);assert.ok(paths.every(p=>p.method==='GET'));
});
test('a private object GET failure stays sanitized and cannot cause a write',async()=>{
 const calls=[];const fetchImpl=async(url,o)=>{
  calls.push({url,method:o.method,hasToken:!!o.headers.Authorization});
  if(url.endsWith('/domains/managed'))return Response.json({success:true,result:{enabled:false}});
  if(url.endsWith('/domains/custom'))return Response.json({success:true,result:{domains:[]}});
  if(url.endsWith('/lock'))return Response.json({success:true,result:{rules:[]}});
  return new Response(null,{status:403});
 };
 await assert.rejects(verifyVersionedR2Candidate(base,{fetchImpl}),/private_object_unreadable/);
 assert.equal(calls.length,4);assert.ok(calls.every(x=>x.method==='GET'&&x.hasToken));
 assert.ok(calls[2].url.endsWith('/lock'));
 assert.ok(calls[3].url.endsWith('/objects/candidates/41709222476/1/production-d1.sql'));
});
test('size mismatch fails before SQLite import and never logs SQL',async()=>{
 const fetchImpl=async url=>{
  if(url.endsWith('/domains/managed'))return Response.json({success:true,result:{enabled:false}});
  if(url.endsWith('/domains/custom'))return Response.json({success:true,result:{domains:[]}});
  if(url.endsWith('/lock'))return Response.json({success:true,result:{rules:[]}});
  return new Response('PRIVATE_SYNTHETIC_SQL',{status:200});
 };
 await assert.rejects(verifyVersionedR2Candidate(base,{fetchImpl}),/observed_size_mismatch/);
});

test('missing, failed, or malformed retention lock policy blocks private SQL reads',async()=>{
 for(const response of [new Response(null,{status:403}),Response.json({success:true,result:{}}),Response.json({success:false,result:{rules:[]}})]){
  const calls=[];
  const fetchImpl=async url=>{
   calls.push(url);
   if(url.endsWith('/domains/managed'))return Response.json({success:true,result:{enabled:false}});
   if(url.endsWith('/domains/custom'))return Response.json({success:true,result:{domains:[]}});
   if(url.endsWith('/lock'))return response;
   throw Error('private SQL must not be fetched without known retention posture');
  };
  await assert.rejects(verifyVersionedR2Candidate(base,{fetchImpl}),/bucket_lock_unverified/);
  assert.equal(calls.length,3);
  assert.ok(calls.every(u=>!u.includes('/objects/')));
 }
});

test('new current-main candidate is fixed run-1 and strictly GET-only before byte qualification',async()=>{
 const e={...base,VERSIONED_RUN_ID:'41892086437'};
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,method:options.method});
  if(url.endsWith('/domains/managed'))return Response.json({success:true,result:{enabled:false}});
  if(url.endsWith('/domains/custom'))return Response.json({success:true,result:{domains:[]}});
  if(url.endsWith('/lock'))return Response.json({success:true,result:{rules:[{id:'candidates-30-day-retention',enabled:true,prefix:'candidates/',condition:{type:'Age',maxAgeSeconds:2592000}}]}});
  return new Response('synthetic-invalid-sized-data',{status:200});
 };
 await assert.rejects(verifyVersionedR2Candidate(e,{fetchImpl}),/observed_size_mismatch/);
 assert.deepEqual(calls.map(x=>x.method),['GET','GET','GET','GET']);
 assert.ok(calls[3].url.endsWith('/objects/candidates/41892086437/1/production-d1.sql'));
});
test('new SQL candidate cannot authorize restore and unknown newer runs fail before network',async()=>{
 await reject({...base,VERSIONED_RUN_ID:'41892086438'});
 await reject({...base,VERSIONED_RUN_ID:'41892086437/2'});
 await reject({...base,VERSIONED_RUN_ID:'41892086437',GITHUB_SHA:'b'.repeat(40)});
});
