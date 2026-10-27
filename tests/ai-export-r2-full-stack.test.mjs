import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiExportR2Binding} from "../server/ai-export-r2-binding.js";
import {createAiPrivateObjectProvider} from "../server/ai-export-private-object-provider.js";
import {createPrivateAiExportStore} from "../server/ai-document-export-private-store.js";
test("R2 binding + private object provider + tenant store enforce access boundary",async()=>{
 let record;const bucket=new Map();const now=Date.now();
 const r2=createAiExportR2Binding({binding:{
  put:async(key,body,options)=>bucket.set(key,{body,customMetadata:options.customMetadata}),
  get:async key=>{const item=bucket.get(key);return item?{customMetadata:item.customMetadata,arrayBuffer:async()=>item.body}:null}
 }});
 const objectProvider=createAiPrivateObjectProvider({bucket:"private-export-r2",clock:()=>now,putObject:r2.putObject,getObject:r2.getObject});
 const store=createPrivateAiExportStore({clock:()=>now,metadata:{
  insert:async data=>(record={...data,id:"j1"}),
  find:async()=>record,
  complete:async fields=>{record={...record,...fields}}
 },objects:objectProvider});
 await store.create({tenantId:"t1",actorId:"a1",conversationId:"c1",messageId:"m1",contentHash:"a".repeat(64),format:"pdf",expiresAt:now+60000});
 await store.complete({tenantId:"t1",actorId:"a1",id:"j1",format:"pdf",objectKey:"ai-exports/t1/j1",bytes:Buffer.from("%PDF")});
 const authorized=await store.readPrivate({tenantId:"t1",actorId:"a1",id:"j1",objectKey:"ai-exports/t1/j1"});
 assert.equal(authorized.toString(),"%PDF");
 assert.equal(await store.readPrivate({tenantId:"t2",actorId:"a1",id:"j1",objectKey:"ai-exports/t1/j1"}),null);
 assert.equal(await store.readPrivate({tenantId:"t1",actorId:"other",id:"j1",objectKey:"ai-exports/t1/j1"}),null);
 assert.equal(bucket.size,1);
});
