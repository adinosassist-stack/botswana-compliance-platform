import test from 'node:test';
import assert from 'node:assert/strict';
import {checkLaunchProvenance,ORIGIN} from '../scripts/check-launch-provenance-readonly.mjs';

const manifest={release:'production',sequence:588,sourceSha:'b'.repeat(40)};
const response=(body,status=200)=>({status,text:async()=>JSON.stringify(body)});
const live={ok:true};
const version={ok:true,release:'production',releaseSequence:588,sourceSha:'b'.repeat(40),runtimeEntry:'release-governance-entry'};
test('exact release identity and live health pass without any mutation',async()=>{
 const calls=[];
 const result=await checkLaunchProvenance(manifest,{fetchImpl:async(url,options)=>{calls.push([url,options]);return response(url.endsWith('/api/version')?version:live);}});
 assert.equal(result.ok,true);
 assert.deepEqual(calls.map(x=>x[0]),[ORIGIN+'/api/version',ORIGIN+'/api/live']);
 assert.ok(calls.every(([_,o])=>o.method==='GET'&&o.redirect==='error'));
});
test('mismatched deployed identity fails closed before health request',async()=>{
 let count=0;
 const result=await checkLaunchProvenance(manifest,{fetchImpl:async()=>{count++;return response({...version,sourceSha:'a'.repeat(40)});}});
 assert.equal(result.ok,false);assert.equal(count,1);assert.equal(result.checks[0].status,'mismatch');
});
test('transport errors fail closed without inventing server status',async()=>{
 const result=await checkLaunchProvenance(manifest,{fetchImpl:async()=>{throw Error('network');}});
 assert.equal(result.ok,false);assert.equal(result.checks[0].status,'unavailable');
});
test('invalid JSON, oversized data and refused HTTP fail closed',async()=>{
 for(const fetchImpl of [
 async()=>({status:200,text:async()=>'{broken'}),
 async()=>({status:200,text:async()=>'.'.repeat(8193)}),
 async()=>response({},503)
 ]){
 const result=await checkLaunchProvenance(manifest,{fetchImpl});assert.equal(result.ok,false);
 }
});
test('invalid manifest refuses any network access',async()=>{
 await assert.rejects(checkLaunchProvenance({...manifest,sourceSha:'bad'},{fetchImpl:async()=>{throw Error('must not call');}}),/invalid_release_manifest/);
});
