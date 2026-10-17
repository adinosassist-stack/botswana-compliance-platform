import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local R2 contract")}}',r2Buckets:['EVIDENCE']}));
try{
  const bucket=await mf.getR2Bucket('EVIDENCE');
  const reserved=await bucket.put('report/file',new Uint8Array(),{onlyIf:{etagDoesNotMatch:'*'}});
  assert.ok(reserved.etag);
  assert.equal(await bucket.put('report/file','duplicate',{onlyIf:{etagDoesNotMatch:'*'}}),null);
  const writes=await Promise.all(['a','b'].map(value=>bucket.put('report/file',value,{onlyIf:{etagMatches:reserved.etag}})));
  assert.equal(writes.filter(Boolean).length,1,'only one competing ETag-bound write may succeed');
  const current=await bucket.get('report/file');assert.ok(['a','b'].includes(await current.text()));
  await bucket.delete('report/file');
  assert.equal(await bucket.put('report/file','late sensitive bytes',{onlyIf:{etagMatches:current.etag}}),null,'deleting a reservation must prevent a late conditional write from recreating the object');
  await bucket.put('report/one','1');await bucket.put('report/two','2');
  const page=await bucket.list({prefix:'report/',limit:1});assert.equal(page.truncated,true);
  await bucket.delete(['report/one','report/two']);assert.equal((await bucket.list({prefix:'report/'})).objects.length,0);
  console.log('Local workerd R2: create-once, competing CAS, delete/write race, pagination and batch deletion PASS');
}finally{await mf.dispose();}
