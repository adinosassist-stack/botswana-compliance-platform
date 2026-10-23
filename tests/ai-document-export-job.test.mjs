import assert from "node:assert/strict";
import {test} from "node:test";
import {createExportJobInput,exportJobStatus,exportJobDownload} from "../server/ai-document-export-job.js";

const identity={authenticated:true,workspaceMember:true,tenantId:"tenant1",actorId:"user1"};
const request={conversationId:"conversation1",messageId:"message1",format:"pdf",documentType:"report"};
const contentHash="a".repeat(64);
const resolver=()=>({authorized:true,actorRole:"assistant",contentHash});
const now=1000;
const job={id:"job1",tenantId:"tenant1",actorId:"user1",status:"completed",format:"pdf",expiresAt:2000,objectKey:"ai-exports/tenant1/job1"};

test("export input is bound to authorized assistant message",()=>{
 const result=createExportJobInput(request,identity,resolver);
 assert.equal(result.ok,true);
 assert.equal(result.value.contentHash,contentHash);
 assert.equal(result.value.tenantId,"tenant1");
});
test("export input rejects unauthorized and unverified messages",()=>{
 assert.equal(createExportJobInput(request,{...identity,workspaceMember:false},resolver).ok,false);
 assert.equal(createExportJobInput(request,identity,()=>({authorized:false,actorRole:"assistant",contentHash})).ok,false);
 assert.equal(createExportJobInput(request,identity,()=>({authorized:true,actorRole:"user",contentHash})).ok,false);
 assert.equal(createExportJobInput(request,identity,()=>Promise.resolve(resolver())).reason,"async_resolver_not_supported");
});
test("job status and download are tenant and actor isolated",()=>{
 assert.equal(exportJobStatus(job,identity,now).ok,true);
 assert.equal(exportJobDownload(job,identity,now).ok,true);
 assert.equal(exportJobDownload(job,{...identity,tenantId:"tenant2"},now).ok,false);
 assert.equal(exportJobDownload(job,{...identity,actorId:"user2"},now).ok,false);
 assert.equal(exportJobDownload({...job,status:"pending"},identity,now).ok,false);
 assert.equal(exportJobDownload(job,identity,2000).ok,false);
});
