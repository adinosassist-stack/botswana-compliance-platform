import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/js/thebe-life-private-read-client.js',import.meta.url),'utf8');
const summary={ok:true,groupId:'g1',memberCount:3,reportedMinor:10000,
  matchedMinor:5000,clearedMinor:2500,bankVerified:false,
  availableToDisburseMinor:null,paymentExecutionEnabled:false};
const history={groupId:'g1',paymentExecutionEnabled:false,records:[{
  id:'c1',memberId:'u1',reportedMinor:10000,matchedMinor:5000,
  clearedMinor:2500,currency:'BWP',bankVerified:false
}]};
const setup=(callback)=>{
  const urls=[],win={fetch:async(url,options)=>{
    urls.push({url,options});
    return callback(url,options);
  }};
  vm.runInNewContext(source,{window:win});
  return {urls,client:win.ThebeLifePrivateReadClient};
};
const ok=(body)=>({ok:true,status:200,json:async()=>body});
test('does not execute fetch without explicit private beta opt-in',async()=>{
  const {urls,client}=setup(()=>{throw new Error('unexpected network');});
  assert.equal((await client.loadGroup({groupId:'g1'})).reason,'private_beta_disabled');
  assert.equal((await client.loadGroup({groupId:'g1',enabled:true})).reason,'private_beta_unavailable');
  assert.equal(urls.length,2);
});
test('rejects crafted group IDs before network access',async()=>{
  const {urls,client}=setup(()=>ok(summary));
  const result=await client.loadGroup({groupId:'https://evil.example',enabled:true});
  assert.equal(result.reason,'invalid_group_id');
  assert.equal(urls.length,0);
});
test('uses only relative same-origin GET requests with no-store and no redirects',async()=>{
  const {urls,client}=setup(url=>ok(url.endsWith('/summary')?summary:history));
  const value=await client.loadGroup({groupId:'g1',enabled:true});
  assert.equal(value.ok,true);
  assert.equal(value.bankVerified,false);
  assert.equal(value.paymentExecutionEnabled,false);
  assert.equal(value.availableToDisburseMinor,null);
  assert.equal(value.contributions[0].clearedMinor,2500);
  assert.equal(urls.length,2);
  for(const {url,options} of urls){
    assert.match(url,/^\/api\/life\/motshelo\/g1\/(summary|contributions)$/);
    assert.equal(options.credentials,'same-origin');
    assert.equal(options.cache,'no-store');
    assert.equal(options.redirect,'error');
    assert.equal(options.method,'GET');
  }
});
test('fails closed for rejected access, forged settlement states and inconsistent data',async()=>{
  const denied=setup(()=>({status:403,ok:false,json:async()=>({error:'not_authorized'})}));
  assert.equal((await denied.client.loadGroup({groupId:'g1',enabled:true})).ok,false);
  const forged=setup(url=>ok(url.endsWith('/summary')?{...summary,bankVerified:true}:history));
  assert.equal((await forged.client.loadGroup({groupId:'g1',enabled:true})).reason,'invalid_private_beta_response');
  const invalid=setup(url=>ok(url.endsWith('/summary')?summary:{...history,records:[{...history.records[0],clearedMinor:20000}]}));
  assert.equal((await invalid.client.loadGroup({groupId:'g1',enabled:true})).reason,'invalid_private_beta_response');
});
