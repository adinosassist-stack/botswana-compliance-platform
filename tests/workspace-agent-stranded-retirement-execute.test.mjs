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
