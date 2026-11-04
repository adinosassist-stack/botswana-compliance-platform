import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBackup,boundedBytes,validateExportUrl,safeFailure} from '../scripts/prepare-private-d1-backup.mjs';
import {validateCandidateReceipt} from '../scripts/qualify-private-pop-backup-evidence-offline.mjs';
const env={GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',BACKUP_CONFIRM:'PREPARE_PRIVATE_PRODUCTION_BACKUP',
  EXPECTED_SHA:'a'.repeat(40),GITHUB_SHA:'a'.repeat(40),PRIVATE_BACKUP_ACCOUNT_ID:'ddd23cab31928a4bb3d4998df9b26d1d',
  PRIVATE_BACKUP_CLOUDFLARE_TOKEN:'secret-test-only',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
const signed='https://'+'b'.repeat(32)+'.r2.cloudflarestorage.com/export.sql?signature=private';
function fixture({publicBucket=false,downloadStatus=200,badRoundtrip=false,exists=false,
  finalBookmark='bookmark',retentionDrift=false,retentionDriftBeforeWrite=false}={}){
  const calls=[];let exportCalls=0,lockReads=0,written;
  const json=result=>Response.json({success:true,result});
  const fetchImpl=async(url,o={})=>{
    calls.push({url,o});
    if(url===signed)return new Response('CREATE TABLE tenants(id TEXT);',{status:downloadStatus});
    if(url.endsWith('/domains/managed'))return json({enabled:publicBucket});
    if(url.endsWith('/domains/custom'))return json({domains:[]});
    if(url.endsWith('/lock')){
      lockReads++;
      const bad=retentionDrift||(retentionDriftBeforeWrite&&lockReads===2);
      return json({rules:[{id:'candidates-30-day-retention',enabled:!bad,
        prefix:'candidates/',condition:{type:'Age',maxAgeSeconds:2592000}}]});
    }
    if(url.endsWith('/d1/database/8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'))return json({uuid:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',name:'bw-compliance-os'});
    if(url.endsWith('/export'))return json(++exportCalls===1?{status:'active',at_bookmark:'bookmark'}:{status:'complete',...(finalBookmark===null?{}:{at_bookmark:finalBookmark}),result:{signed_url:signed}});
    if(url.includes('/objects/candidates/123/1/production-d1.sql')){
      if(o.method==='PUT'){written=Buffer.from(o.body);return Response.json({success:true,result:{}});}
      if(!written)return new Response(null,{status:exists?200:404});
      return new Response(badRoundtrip?'corrupt':written);
    }
    throw Error('unexpected endpoint');
  };
  return {calls,fetchImpl,pause:async()=>{}};
}
test('private candidate roundtrip uses fixed source and never sends bearer to signed URL',async()=>{
  const f=fixture();let checks=0;const r=await prepareBackup(env,{...f,assertCurrent:async()=>{checks++}});
  assert.equal(r.privateRoundtripVerified,true);
  assert.equal(Object.hasOwn(r,'backupIndependentlyApproved'),false);
  assert.equal(Object.hasOwn(r,'restorePerformed'),false);
  assert.equal(checks,2);
  assert.equal(f.calls.filter(x=>x.url.endsWith('/lock')).length,2,'retention must be checked before export and immediately before PUT');
  assert.equal(r.candidateKey,'candidates/123/1/production-d1.sql');
  assert.equal(r.accountId,env.PRIVATE_BACKUP_ACCOUNT_ID);
  assert.equal(r.databaseId,'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce');
  assert.equal(r.bucket,'bw-compliance-ops-backups');
  assert.equal(r.runId,env.GITHUB_RUN_ID);
  assert.equal(r.attempt,env.GITHUB_RUN_ATTEMPT);
  const independentlyUnapproved=validateCandidateReceipt(r,{expectedMainSha:env.EXPECTED_SHA});
  assert.equal(independentlyUnapproved.candidateKey,r.candidateKey);
  assert.equal(independentlyUnapproved.remotelyVerifiedSha256,false);
  assert.equal(independentlyUnapproved.restoreApproved,false);
  assert.equal(independentlyUnapproved.productionWriteAuthorized,false);
  const download=f.calls.find(x=>x.url===signed);assert.equal(download.o.headers,undefined);assert.equal(download.o.redirect,'error');
  assert.equal(f.calls.filter(x=>x.o.method==='PUT').length,1);
  assert.ok(f.calls.filter(x=>x.o.method==='POST').every(x=>x.url.endsWith('/export')));
  assert.ok(!JSON.stringify(r).includes('signature=private'));assert.ok(!JSON.stringify(r).includes(env.PRIVATE_BACKUP_CLOUDFLARE_TOKEN));
});
test('authority mismatch prevents all provider calls',async()=>{
  for(const patch of [{GITHUB_REF:'refs/heads/feature'},{GITHUB_EVENT_NAME:'pull_request'},
    {EXPECTED_SHA:'c'.repeat(40)},{PRIVATE_BACKUP_ACCOUNT_ID:'d'.repeat(32)},{BACKUP_CONFIRM:'go'},
    {PRIVATE_BACKUP_CLOUDFLARE_TOKEN:''},{GITHUB_RUN_ATTEMPT:'../2'}]){
    const f=fixture();await assert.rejects(prepareBackup({...env,...patch},f),/authority/);assert.equal(f.calls.length,0);
  }
});
test('public bucket stops before export',async()=>{
  const f=fixture({publicBucket:true});await assert.rejects(prepareBackup(env,f),/bucket_public/);
  assert.equal(f.calls.some(x=>x.o.method==='POST'),false);
});
test('missing or blank completed export bookmark stops before any candidate download or write',async()=>{
 for(const finalBookmark of [null,'','  ','short','bad bookmark','x'.repeat(301)]){
  const f=fixture({finalBookmark});
  await assert.rejects(prepareBackup(env,f),/export_bookmark/);
  assert.equal(f.calls.some(x=>x.url===signed),false);
  assert.equal(f.calls.some(x=>x.o.method==='PUT'),false);
 }
});
test('signed download refusal stops before private storage writes',async()=>{
  const f=fixture({downloadStatus:403});await assert.rejects(prepareBackup(env,f),/download_refused/);
  assert.equal(f.calls.some(x=>x.o.method==='PUT'),false);
});
test('unverified or existing candidate is never overwritten',async()=>{
  const f=fixture({exists:true});await assert.rejects(prepareBackup(env,f),/candidate_exists/);
  assert.equal(f.calls.some(x=>x.o.method==='PUT'),false);
});
test('roundtrip byte corruption cannot report success',async()=>{
  await assert.rejects(prepareBackup(env,fixture({badRoundtrip:true})),/roundtrip_mismatch/);
});
test('main drift before write prevents candidate upload',async()=>{
  const f=fixture();let n=0;await assert.rejects(prepareBackup(env,{...f,assertCurrent:async()=>{if(++n===2)throw Error('main drift')}}),/main drift/);
  assert.equal(f.calls.some(x=>x.o.method==='PUT'),false);
});
test('signed URL host, HTTPS, userinfo and redirect boundary are strict',()=>{
  assert.equal(validateExportUrl(signed),signed);
  for(const u of ['https://evil.test/a','http://'+'b'.repeat(32)+'.r2.cloudflarestorage.com/a',
    signed.replace('https://','https://user:pass@'),signed+'#fragment',signed.replace('.com/','.com:444/')])
    assert.throws(()=>validateExportUrl(u),/export_url/);
});
test('download bounds actual streaming bytes even without Content-Length',async()=>{
  await assert.rejects(boundedBytes(new Response('123456'),5),/size_limit/);
  await assert.rejects(boundedBytes(new Response('1',{headers:{'content-length':'100'}}),5),/size_limit/);
  await assert.rejects(boundedBytes(new Response('')),/empty_download/);
});
test('provider refusal reports fixed stage/status without response body, URL or credentials',async()=>{
  const sensitive='signed-url customer SQL secret-test-only';
  let error;
  try{await prepareBackup(env,{fetchImpl:async()=>new Response(sensitive,{status:403})});}catch(e){error=e;}
  assert.deepEqual(safeFailure(error),{code:'provider_refused',stage:'backup_bucket_managed_domain',httpStatus:403});
  assert.equal(JSON.stringify(safeFailure(error)).includes(sensitive),false);
});
test('untrusted thrown errors cannot impersonate an internal diagnostic',async()=>{
  const e=new Error('private_backup_provider_refused secret-test-only');e.code='authority';e.diagnostic={stage:signed};
  assert.deepEqual(safeFailure(e),{code:'unexpected_failure'});
  let caught;try{await prepareBackup(env,{fetchImpl:async()=>{throw e}})}catch(x){caught=x;}
  assert.deepEqual(safeFailure(caught),{code:'transport_failed',stage:'backup_bucket_managed_domain'});
});


test('retention policy drift refuses export before provider POST and refuses mutation at write boundary',async()=>{
 const early=fixture({retentionDrift:true});
 await assert.rejects(prepareBackup(env,early),/r2_retention_readback_hold_policy_mismatch/);
 assert.equal(early.calls.some(x=>x.o.method==='POST'),false);
 assert.equal(early.calls.some(x=>x.o.method==='PUT'),false);
 const late=fixture({retentionDriftBeforeWrite:true});
 await assert.rejects(prepareBackup(env,late),/r2_retention_readback_hold_policy_mismatch/);
 assert.ok(late.calls.some(x=>x.o.method==='POST'));
 assert.equal(late.calls.some(x=>x.o.method==='PUT'),false);
});

test('scheduled authority requires real GitHub records; manual path never requests schedule grants',async()=>{
 const f=fixture();
 const scheduled={...env,GITHUB_EVENT_NAME:'schedule',BACKUP_CONFIRM:'',
   PRIVATE_BACKUP_SCHEDULE_ENABLED:'true',GITHUB_TOKEN:'test-git',
   PRIVATE_BACKUP_SCHEDULE_OWNER_APPROVAL_ID:'31001',
   PRIVATE_BACKUP_SCHEDULE_REVIEW_APPROVAL_ID:'31002'};
 const created_at=new Date(Date.now()-3600000).toISOString().slice(0,19)+'Z';
 const expiresAt=new Date(Date.now()+3600000).toISOString().slice(0,19)+'Z';
 const payload={
   scope:'HOURLY_PRIVATE_D1_CANDIDATE_EXPORT_ONLY',sourceSha:scheduled.GITHUB_SHA,
   accountId:scheduled.PRIVATE_BACKUP_ACCOUNT_ID,
   databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
   bucket:'bw-compliance-ops-backups',prefix:'candidates/',
   maxIntervalMinutes:120,retentionDays:30,
   retentionAndAccessAccepted:true,dedicatedCredentialScopeAccepted:true,expiresAt
 };
 const rec=(id,login)=>({id,user:{login},created_at,
   issue_url:'https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/issues/1950',
   body:'THEBE_RECURRING_BACKUP_APPROVAL\n'+JSON.stringify(payload)});
 let approvalCalls=0;
 const approvalFetchImpl=async url=>{
   approvalCalls++;
   if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:scheduled.GITHUB_SHA}});
   if(url.endsWith('/issues/comments/31001'))return Response.json(rec(31001,'adinosassist-stack'));
   if(url.endsWith('/issues/comments/31002'))return Response.json(rec(31002,'thusico'));
   throw Error('unexpected GitHub URL');
 };
 const approved=await prepareBackup(scheduled,{...f,approvalFetchImpl});
 assert.equal(approvalCalls,3);
 assert.equal(approved.privateRoundtripVerified,true);
 assert.equal(f.calls.filter(x=>x.o.method==='PUT').length,1);
 const manual=fixture();
 const r=await prepareBackup(env,{...manual,approvalFetchImpl:async()=>{throw Error('manual must not request schedule approvals')}});
 assert.equal(r.privateRoundtripVerified,true);
});
