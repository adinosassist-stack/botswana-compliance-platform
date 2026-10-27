import assert from "node:assert/strict";
import {test} from "node:test";
import {createPrivateAiExportStore} from "../server/ai-document-export-private-store.js";
import {auditExpiredExportJobs} from "../server/ai-document-export-retention-audit.js";
const input={tenantId:"tenant1",actorId:"actor1",conversationId:"conv1",messageId:"msg1",contentHash:"a".repeat(64),format:"pdf",expiresAt:2000};
test("private storage adapter retains server-side ownership and read-only expiry reporting",async()=>{
 let row=null;const blobs=new Map();
 const store=createPrivateAiExportStore({clock:()=>1000,metadata:{
  insert:async v=>(row={...v,id:"job1"}),find:async()=>row,
  complete:async update=>{row={...row,...update}}
 },objects:{put:async(k,v)=>blobs.set(k,v),get:async k=>blobs.get(k)}});
 const created=await store.create(input);
 assert.equal(created.tenantId,"tenant1");
 await store.complete({tenantId:"tenant1",actorId:"actor1",id:"job1",objectKey:"ai-exports/tenant1/job1",bytes:Buffer.from("%PDF-test"),format:"pdf"});
 assert.equal((await store.readPrivate({tenantId:"tenant1",actorId:"actor1",id:"job1",objectKey:"ai-exports/tenant1/job1"})).toString(),"%PDF-test");
 assert.equal(await store.readPrivate({tenantId:"tenant1",actorId:"actor2",id:"job1",objectKey:"ai-exports/tenant1/job1"}),null);
 assert.equal(auditExpiredExportJobs([row],{now:2000}).eligible,1);
 assert.equal(blobs.size,1); // audit must never remove stored bytes
});
test("no arbitrary blob URLs or filesystem paths are accepted",async()=>{
 const store=createPrivateAiExportStore({clock:()=>1000,metadata:{insert:async d=>({...d,id:"job1"}),find:async()=>null,complete:async()=>{}},objects:{put:async()=>{throw Error("unexpected write")},get:async()=>null}});
 await assert.rejects(store.complete({tenantId:"tenant1",actorId:"actor1",id:"job1",objectKey:"https://public.example/file",bytes:Buffer.from("x"),format:"pdf"}));
 assert.equal(auditExpiredExportJobs([{id:"job1",tenantId:"tenant1",actorId:"actor1",expiresAt:1000,objectKey:"../secret"}],{now:1000}).invalid,1);
});
