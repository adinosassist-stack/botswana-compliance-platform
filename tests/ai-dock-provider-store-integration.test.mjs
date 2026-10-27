import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiPrivateObjectProvider} from "../server/ai-export-private-object-provider.js";
import {createPrivateAiExportStore} from "../server/ai-document-export-private-store.js";
const input={tenantId:"tenant1",actorId:"actor1",conversationId:"conv1",messageId:"msg1",contentHash:"a".repeat(64),format:"pdf",expiresAt:2000};
test("private provider and export job store integrate without public URLs",async()=>{
 let record=null;const files=new Map();const writes=[];
 const provider=createAiPrivateObjectProvider({bucket:"export-private",clock:()=>1000,
  putObject:async ({bucket,key,body,visibility})=>{writes.push({bucket,key,visibility});files.set(key,body)},
  getObject:async ({key})=>files.get(key)});
 const store=createPrivateAiExportStore({clock:()=>1000,metadata:{insert:async v=>(record={...v,id:"job1"}),find:async()=>record,complete:async v=>{record={...record,...v}}},objects:provider});
 const created=await store.create(input);assert.equal(created.id,"job1");
 await store.complete({tenantId:"tenant1",actorId:"actor1",id:"job1",format:"pdf",objectKey:"ai-exports/tenant1/job1",bytes:Buffer.from("%PDF-content")});
 assert.equal(writes[0].visibility,"private");
 assert.equal((await store.readPrivate({tenantId:"tenant1",actorId:"actor1",id:"job1",objectKey:"ai-exports/tenant1/job1"})).toString(),"%PDF-content");
 assert.equal(await store.readPrivate({tenantId:"tenant1",actorId:"foreign",id:"job1",objectKey:"ai-exports/tenant1/job1"}),null);
 assert.equal(files.size,1);
});
