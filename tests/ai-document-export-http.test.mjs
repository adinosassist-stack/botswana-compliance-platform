import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiExportHandlers} from "../server/ai-document-export-http.js";
const identity={authenticated:true,workspaceMember:true,tenantId:"tenant1",actorId:"user1"};
const hash="a".repeat(64);
const job={id:"job1",tenantId:"tenant1",actorId:"user1",status:"completed",format:"pdf",expiresAt:2000,objectKey:"ai-exports/tenant1/job1",title:"Thebe Report"};
const make=(actor=identity)=>createAiExportHandlers({
 identityFor:async()=>actor,
 resolveMessage:async()=>({authorized:true,actorRole:"assistant",contentHash:hash}),
 createJob:async()=>job,
 findJob:async()=>job,
 readPrivateObject:async()=>Buffer.from("%PDF-sample"),
 now:()=>1000
});
test("create requires authorized source and returns scoped status",async()=>{
 const result=await make().create({body:{conversationId:"c1",messageId:"m1",format:"pdf",documentType:"report"}});
 assert.equal(result.status,202);
 assert.equal(result.body.id,"job1");
 assert.equal(result.body.objectKey,undefined);
});
test("download returns private attachment headers only to origin actor",async()=>{
 const ok=await make().download({params:{id:"job1"}});
 assert.equal(ok.status,200);
 assert.match(ok.headers["Content-Disposition"],/attachment/);
 assert.equal(ok.bytes.toString(),"%PDF-sample");
 const denied=await make({...identity,actorId:"another"}).download({params:{id:"job1"}});
 assert.equal(denied.status,404);
 assert.equal(denied.bytes,undefined);
});
test("invalid job IDs never reach the lookup",async()=>{
 let lookups=0;
 const handlers=createAiExportHandlers({
 identityFor:async()=>identity,
 resolveMessage:async()=>null,
 createJob:async()=>job,
 findJob:async()=>{lookups++;return job},
 readPrivateObject:async()=>Buffer.from("x"),
 now:()=>1000
 });
 assert.equal((await handlers.status({params:{id:"../secret"}})).status,404);
 assert.equal((await handlers.download({params:{id:"../secret"}})).status,404);
 assert.equal(lookups,0);
});
