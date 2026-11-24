import assert from "node:assert/strict";
import {checkConversationInitialization as check} from "../scripts/conversation-staging-initialization-preflight.mjs";
const base={accountId:"ddd23cab31928a4bb3d4998df9b26d1d",databaseId:"95c48030-0395-44cb-aa95-622beaf4efdf",token:"synthetic-test",sourceSha:"a".repeat(40)};
let calls=0;
const mock=(objects)=>async(url,options)=>{
 calls++;
 assert(url.endsWith("/"+base.databaseId+"/query"));
 assert.equal(options.method,"POST");
 assert.equal(options.redirect,"error");
 assert.match(JSON.parse(options.body).sql,/^SELECT /);
 return {ok:true,json:async()=>({success:true,result:[{success:true,results:objects}]})};
};
for(const bad of [{databaseId:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"},{accountId:"b".repeat(32)},{sourceSha:"main"},{token:""}]){
 await assert.rejects(check({...base,...bad,fetcher:mock([])}),/invalid_staging_target/);
}
assert.equal(calls,0);
const empty=await check({...base,fetcher:mock([{type:"table",name:"_cf_KV"}])});
assert.equal(empty.emptyCandidate,true);
assert.equal(empty.readOnly,true);
assert.equal(empty.migrationAuthorized,false);
assert.equal(empty.activationAuthorized,false);
assert.match(empty.schemaSha256,/^[a-f0-9]{64}$/);
const nonempty=await check({...base,fetcher:mock([{type:"table",name:"_cf_KV"},{type:"table",name:"sessions"}])});
assert.equal(nonempty.emptyCandidate,false);
assert.deepEqual(nonempty.unexpectedObjects,[{name:"sessions",type:"table"}]);
await assert.rejects(check({...base,fetcher:mock([{}])}),/invalid_catalog_entry/);
await assert.rejects(check({...base,fetcher:async()=>({ok:true,json:async()=>({success:true,result:[{success:true}]})})}),/invalid_catalog_response/);
await assert.rejects(check({...base,fetcher:async()=>({ok:false,status:403})}),/staging_catalog_unavailable/);
console.log("Conversation initialization preflight PASS");
