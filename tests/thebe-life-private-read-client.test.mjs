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
const setup=(handler,connected=true)=>{
  const requests=[];
  const win={BW:connected?{api:{createClient:()=>({request:async(path,options)=>{
    requests.push({path,options});
    return handler(path,options);
  }})}}:undefined};
  vm.runInNewContext(source,{window:win});
  return {requests,client:win.ThebeLifePrivateReadClient};
};
test('does not request private data without explicit opt-in or canonical client',async()=>{
  const offline=setup(()=>{throw new Error('unexpected');});
  assert.equal((await offline.client.loadGroup({groupId:'g1'})).reason,'private_beta_disabled');
  assert.equal(offline.requests.length,0);
  const missing=setup(()=>{},false);
  assert.equal((await missing.client.loadGroup({groupId:'g1',enabled:true})).reason,'transport_unavailable');
});
test('rejects crafted group IDs before network access',async()=>{
  const {requests,client}=setup(()=>summary);
  const result=await client.loadGroup({groupId:'https://evil.example',enabled:true});
  assert.equal(result.reason,'invalid_group_id');
  assert.equal(requests.length,0);
});
test('uses canonical client only for relative read-only endpoints',async()=>{
  const {requests,client}=setup(path=>path.endsWith('/summary')?summary:history);
  const result=await client.loadGroup({groupId:'g1',enabled:true});
  assert.equal(result.ok,true);
  assert.equal(result.bankVerified,false);
  assert.equal(result.paymentExecutionEnabled,false);
  assert.equal(result.availableToDisburseMinor,null);
  assert.equal(result.contributions[0].clearedMinor,2500);
  assert.equal(requests.length,2);
  for(const {path,options} of requests){
    assert.match(path,/^\/api\/life\/motshelo\/g1\/(summary|contributions)$/);
    assert.equal(options.method,'GET');
    assert.equal(options.cache,'no-store');
  }
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.match(source,/BW\?\.api\?\.createClient/);
});
test('fails closed for denied access, forged settlement states and inconsistent records',async()=>{
  const denied=setup(()=>{throw Object.assign(new Error('forbidden'),{status:403});});
  assert.equal((await denied.client.loadGroup({groupId:'g1',enabled:true})).reason,'not_authorized_or_unavailable');
  const forged=setup(path=>path.endsWith('/summary')?{...summary,bankVerified:true}:history);
  assert.equal((await forged.client.loadGroup({groupId:'g1',enabled:true})).reason,'invalid_private_beta_response');
  const invalid=setup(path=>path.endsWith('/summary')?summary:{...history,records:[{...history.records[0],clearedMinor:20000}]});
  assert.equal((await invalid.client.loadGroup({groupId:'g1',enabled:true})).reason,'invalid_private_beta_response');
});
