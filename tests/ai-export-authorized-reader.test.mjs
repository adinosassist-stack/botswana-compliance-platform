import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAuthorizedAiExportReader} from '../server/ai-export-authorized-reader.js';
import {createAiExportR2Binding} from '../server/ai-export-r2-binding.js';
const NOW=10_000_000;
const good={authenticated:true,tenantId:'tenant-a',actorId:'actor-a'};
const base={id:'job-a',tenantId:'tenant-a',actorId:'actor-a',status:'completed',
  objectKey:'ai-exports/tenant-a/job-a',expiresAt:NOW+120000};
function fixture(record=base){
 const events=[],bytes=Buffer.from('%PDF-1.7 synthetic');
 let object=null;
 const raw={
  async put(key,body,opts){object={key,bytes:Buffer.from(body),metadata:opts.customMetadata}},
  async get(key){events.push(['r2',key]);if(!object||object.key!==key)return null;
   return {size:object.bytes.length,customMetadata:object.metadata,arrayBuffer:async()=>object.bytes}}
 };
 const storage=createAiExportR2Binding({binding:raw,clock:()=>NOW});
 const metadata={async find(args){events.push(['metadata',args]);return record;}};
 const reader=createAuthorizedAiExportReader({metadata,storage,clock:()=>NOW});
 return {reader,storage,events,raw,object:()=>object,bytes};
}
async function seeded(record=base){
 const x=fixture(record);
 await x.storage.putObject({key:base.objectKey,body:x.bytes,visibility:'private',expiresAt:base.expiresAt});
 return x;
}
test('authenticated tenant and actor can read only their completed private export',async()=>{
 const x=await seeded();
 assert.deepEqual(await x.reader.read({principal:good,jobId:'job-a'}),x.bytes);
 assert.deepEqual(x.events.map(e=>e[0]),['metadata','r2']);
 assert.equal(x.events[1][1],base.objectKey);
});
test('reject unauthenticated, malformed IDs and caller-supplied object key before IO',async()=>{
 for(const principal of [null,{...good,authenticated:false},{...good,authenticated:'true'},
  {...good,tenantId:'../foreign'},{...good,actorId:''}]){
   const x=await seeded();
   assert.equal(await x.reader.read({principal,jobId:'job-a',key:base.objectKey}),null);
   assert.equal(x.events.length,0);
 }
 const x=await seeded();assert.equal(await x.reader.read({principal:good,jobId:'../job-a'}),null);
 assert.equal(x.events.length,0);
});
test('correct foreign object key cannot bypass tenant or actor ownership',async()=>{
 for(const principal of [{...good,tenantId:'tenant-b'},{...good,actorId:'actor-b'}]){
  const x=await seeded();
  assert.equal(await x.reader.read({principal,jobId:'job-a',key:base.objectKey}),null);
  assert.deepEqual(x.events.map(e=>e[0]),['metadata']);
 }
});
test('reject queued, missing, foreign, stale or manipulated record before R2 access',async()=>{
 const cases=[null,{...base,status:'queued'},{...base,tenantId:'tenant-b'},
  {...base,actorId:'actor-b'},{...base,id:'different'},
  {...base,objectKey:'ai-exports/tenant-b/job-a'},
  {...base,expiresAt:NOW},{...base,expiresAt:'120000'}];
 for(const record of cases){
  const x=await seeded(record);
  assert.equal(await x.reader.read({principal:good,jobId:'job-a'}),null);
  assert.equal(x.events.some(e=>e[0]==='r2'),false);
 }
});
test('metadata and storage exceptions yield no customer data',async()=>{
 const x=await seeded();
 const bad=createAuthorizedAiExportReader({metadata:{find:async()=>{throw Error('token=secret')}},
  storage:x.storage,clock:()=>NOW});
 assert.equal(await bad.read({principal:good,jobId:'job-a'}),null);
 const badStorage=createAuthorizedAiExportReader({metadata:{find:async()=>base},
  storage:{getObject:async()=>{throw Error('password=secret')}},clock:()=>NOW});
 assert.equal(await badStorage.read({principal:good,jobId:'job-a'}),null);
});
test('underlying R2 integrity and expiry still enforced after authorization',async()=>{
 const x=await seeded();
 x.object().bytes[0]=0;
 assert.equal(await x.reader.read({principal:good,jobId:'job-a'}),null);
 const expired=await seeded({...base,expiresAt:NOW-1});
 assert.equal(await expired.reader.read({principal:good,jobId:'job-a'}),null);
 assert.equal(expired.events.some(e=>e[0]==='r2'),false);
});
