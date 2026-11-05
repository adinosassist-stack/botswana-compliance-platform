import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAiExportR2Binding} from '../server/ai-export-r2-binding.js';
import {createAiExportStagingRetention} from '../server/ai-export-staging-retention.js';

// Fully local synthetic R2. No Cloudflare API, customer record, or real object access.
const clock={now:4*60*60*1000};
function fixture(){
 const objects=new Map(),log=[];
 const raw={
  async put(key,body,options){log.push(['put',key]);objects.set(key,{bytes:Buffer.from(body),metadata:{...options.customMetadata}})},
  async get(key){log.push(['get',key]);const item=objects.get(key);return item?{
   size:item.bytes.length,customMetadata:item.metadata,arrayBuffer:async()=>item.bytes}:null},
  async delete(key){log.push(['delete',key]);objects.delete(key)}
 };
 const storage=createAiExportR2Binding({binding:raw,clock:()=>clock.now});
 return {objects,log,raw,storage};
}
const pdf=Buffer.from('%PDF-1.7\n% synthetic fixture only');
const key='ai-exports/tenant-a/job-a';

test('local synthetic private PDF round-trip preserves hash and refuses public access',async()=>{
 const x=fixture();
 await x.storage.putObject({key,body:pdf,visibility:'private',expiresAt:clock.now+120000});
 assert.deepEqual(await x.storage.getObject({key,visibility:'private'}),pdf);
 assert.equal(await x.storage.getObject({key,visibility:'public'}),null);
 assert.equal(x.objects.get(key).metadata.sha256.length,64);
 assert.deepEqual(x.log.map(z=>z[0]),['put','get']);
});

test('cross-tenant key is never substituted by local R2 mock',async()=>{
 const x=fixture();
 await x.storage.putObject({key,body:pdf,visibility:'private',expiresAt:clock.now+120000});
 assert.equal(await x.storage.getObject({key:'ai-exports/tenant-b/job-a',visibility:'private'}),null);
 // Deliberate limitation: the low-level adapter alone does NOT enforce request identity.
 // HTTP authorization must independently check tenant and actor before passing a key.
 assert.deepEqual(await x.storage.getObject({key,visibility:'private'}),pdf);
});

test('tampering and expired metadata fail closed for local R2 reads',async()=>{
 const x=fixture();
 await x.storage.putObject({key,body:pdf,visibility:'private',expiresAt:clock.now+120000});
 x.objects.get(key).bytes[0]=0;
 assert.equal(await x.storage.getObject({key,visibility:'private'}),null);
 x.objects.get(key).bytes=Buffer.from(pdf);
 clock.now+=121000;
 try{assert.equal(await x.storage.getObject({key,visibility:'private'}),null)}
 finally{clock.now-=121000}
});

test('retention dry-run never deletes synthetic objects; foreign rows remain untouched',async()=>{
 const x=fixture();
 const expiry=clock.now-2*3600000;
 await x.storage.putObject({key,body:pdf,visibility:'private',expiresAt:clock.now+60000});
 const row={id:'job-a',tenantId:'tenant-a',actorId:'actor-a',status:'completed',objectKey:key,expiresAt:expiry};
 const foreign={...row,id:'job-b',tenantId:'tenant-b',objectKey:key};
 const metadata={
  async listExpired(){return [row,foreign]},
  async find({id,tenantId,actorId}){return id===row.id&&tenantId===row.tenantId&&actorId===row.actorId?row:null}
 };
 const evidenceBinding={async delete(){throw Error('evidence binding accessed')}};
 const retention=createAiExportStagingRetention({enabled:true,environment:'isolated-staging',metadata,exportBinding:x.raw,evidenceBinding,clock:()=>clock.now});
 const report=await retention.run();
 assert.equal(report.mode,'read_only');
 assert.equal(report.deleted,0);
 assert.equal(report.eligible,1);
 assert.equal(report.invalid,1);
 assert.equal(x.objects.has(key),true);
 assert.equal(x.log.some(z=>z[0]==='delete'),false);
 const noApproval=await retention.run({dryRun:false,approval:false,confirmation:'DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING'});
 assert.equal(noApproval.deleted,0);
 assert.equal(x.objects.has(key),true);
});
