import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInputs,CONFIRM,DELETE_URL,executeVersionRetirement} from '../scripts/workspace-agent-stranded-retirement-execute.mjs';

const expected={
 GITHUB_ACTOR:'adinosassist-stack', GITHUB_REF:'refs/heads/main',
 EXPECTED_SHA:'347b182aab5e83c3036cf513c925291ff5badfc7',
 GITHUB_SHA:'347b182aab5e83c3036cf513c925291ff5badfc7',
 CANDIDATE:'9ba41e62-9efc-49c5-9d4e-d667057e43fb',
 OWNER_COMMENT:'6905031894', DESTRUCTIVE_CONFIRM:CONFIRM,
 GH_TOKEN:'synthetic-github',READONLY_TOKEN:'synthetic-readonly',WRITE_TOKEN:'synthetic-write'
};

test('accepts exact inert source-bound inputs (synthetic tokens)',()=>{
 assert.doesNotThrow(()=>validateInputs(expected));
});
for(const [label,key,value] of [
 ['wrong actor','GITHUB_ACTOR','thusico'],
 ['wrong source','GITHUB_SHA','f'.repeat(40)],
 ['stale SHA','EXPECTED_SHA','e'.repeat(40)],
 ['non-main ref','GITHUB_REF','refs/heads/other'],
 ['different candidate','CANDIDATE','other-version'],
 ['missing owner comment','OWNER_COMMENT',''],
 ['incorrect confirmation','DESTRUCTIVE_CONFIRM','go'],
 ['missing read token','READONLY_TOKEN',''],
 ['missing write token','WRITE_TOKEN','']
]){
 test('denies '+label,()=>{
  assert.throws(()=>validateInputs({...expected,[key]:value}),/BLOCK/);
 });
}
test('denies reusing a readonly token as a write token',()=>{
 assert.throws(()=>validateInputs({...expected,WRITE_TOKEN:expected.READONLY_TOKEN}),/BLOCK/);
});
test('rejects unauthorized input before any network calls or DELETE',async()=>{
 let requests=0;
 await assert.rejects(executeVersionRetirement({
  env:{...expected,DESTRUCTIVE_CONFIRM:'GO'},
  fetchImpl:async()=>{requests++;throw Error('should not call network');}
 }),/BLOCK/);
 assert.equal(requests,0);
});
test('deletion URL is one fully qualified isolated staging version, never Worker or latest',()=>{
 assert.equal(DELETE_URL,
 'https://api.cloudflare.com/client/v4/accounts/b11d872b2660e76ca66323023b45b3ab/workers/workers/bw-workspace-agent-staging/versions/9ba41e62-9efc-49c5-9d4e-d667057e43fb');
 assert.ok(!DELETE_URL.endsWith('/latest'));
});
test('main drift fails before inventory and before any write',async()=>{
 const urls=[];
 await assert.rejects(executeVersionRetirement({env:expected,fetchImpl:async(url,options)=>{
  urls.push({url,method:options.method});
  return {ok:true,json:async()=>({object:{sha:'f'.repeat(40)}})};
 }}),/BLOCK main_drift/);
 assert.equal(urls.length,1);
 assert.equal(urls[0].method,'GET');
});

import {expectedOwnerStatement} from '../scripts/workspace-agent-stranded-retirement-owner-acceptance.mjs';

// Synthetic HTTP fixtures: never connect to GitHub or Cloudflare.
function mockReadOnlyHttp({owner='valid',inventory='invalid',main='same'}={}){
 const calls=[];
 const http=async(url,options)=>{
  calls.push({url,method:options.method});
  if(options.method!=='GET')throw Error('TEST FAILED: unexpected write operation');
  const json=(value,ok=true)=>({ok,json:async()=>value});
  if(url.endsWith('/git/ref/heads/main')){
   return json({object:{sha:main==='same'?expected.EXPECTED_SHA:'f'.repeat(40)}});
  }
  if(url.includes('/issues/comments/')){
   const comment={
    id:Number(expected.OWNER_COMMENT),
    user:{login:owner==='wrong_author'?'untrusted': 'adinosassist-stack'},
    issue_url:'https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/issues/2505',
    created_at:'2026-11-16T00:00:00Z',
    updated_at:owner==='edited'?'2026-11-16T00:01:00Z':'2026-11-16T00:00:00Z',
    body:owner==='stale'?expectedOwnerStatement('f'.repeat(40)):expectedOwnerStatement(expected.EXPECTED_SHA)
   };
   return json(comment);
  }
  if(inventory==='http_error')return json({success:false},false);
  if(inventory==='invalid')return json({success:false,result:{}});
  throw Error('unknown synthetic inventory mode');
 };
 return {http,calls};
}
for(const owner of ['wrong_author','edited','stale']){
 test('rejects '+owner+' approval before Cloudflare inventory or DELETE',async()=>{
  const m=mockReadOnlyHttp({owner});
  await assert.rejects(executeVersionRetirement({env:expected,fetchImpl:m.http}),/BLOCK owner_authorization_invalid/);
  assert.equal(m.calls.length,2);
  assert.ok(m.calls.every(x=>x.method==='GET'));
  assert.ok(m.calls.every(x=>!x.url.includes('cloudflare.com')));
 });
}
test('rejects malformed live Cloudflare inventory without DELETE',async()=>{
 const m=mockReadOnlyHttp({inventory:'invalid'});
 await assert.rejects(executeVersionRetirement({env:expected,fetchImpl:m.http}),/BLOCK live_eligibility_invalid/);
 assert.ok(m.calls.length>2);
 assert.ok(m.calls.every(x=>x.method==='GET'));
});
test('fails closed on a Cloudflare read-only API error with no DELETE',async()=>{
 const m=mockReadOnlyHttp({inventory:'http_error'});
 await assert.rejects(executeVersionRetirement({env:expected,fetchImpl:m.http}),/BLOCK remote_request_failed/);
 assert.ok(m.calls.every(x=>x.method==='GET'));
});
test('fails before Cloudflare on initial main drift',async()=>{
 const m=mockReadOnlyHttp({main:'changed'});
 await assert.rejects(executeVersionRetirement({env:expected,fetchImpl:m.http}),/BLOCK main_drift/);
 assert.deepEqual(m.calls.map(x=>x.method),['GET']);
});
