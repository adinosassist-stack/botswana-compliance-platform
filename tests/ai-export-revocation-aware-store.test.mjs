import assert from "node:assert/strict";
import {test} from "node:test";
import {createRevocationAwareAiExportStore} from "../server/ai-export-revocation-aware-store.js";
import {createAuthorizedAiExportMessageLoader} from "../server/ai-export-authorized-message-loader.js";
import {createPrivateAiExportStore} from "../server/ai-document-export-private-store.js";
import {createAiExportService} from "../server/ai-document-export-service.js";
const identity={authenticated:true,workspaceMember:true,tenantId:"tenant1",actorId:"user1"};
const request={conversationId:"conv1",messageId:"msg1",format:"pdf",documentType:"report"};
function system(){
 const status={allowed:true,documentText:"P 1,250",deleted:false,error:false,revokeOnRead:false};
 let job=null,blobReads=0,blobWrites=0;
 const bytes=Buffer.from("%PDF-test");
 const objects={
  put:async()=>{blobWrites++},
  get:async()=>{blobReads++;if(status.revokeOnRead)status.allowed=false;return bytes}
 };
 const metadata={
  insert:async input=>(job={...input,id:"export1"}),
  find:async({id,tenantId,actorId})=>job?.id===id&&job.tenantId===tenantId&&job.actorId===actorId?job:null,
  complete:async update=>{job={...job,...update}}
 };
 const source=createAuthorizedAiExportMessageLoader({
  readConversation:async()=>({id:"conv1",tenantId:"tenant1",deleted:status.deleted}),
  canReadConversation:async()=>{if(status.error)throw Error("secret membership API");return status.allowed},
  readMessage:async()=>({id:"msg1",conversationId:"conv1",tenantId:"tenant1",role:"assistant",isFinal:true}),
  documentForMessage:async()=>({title:"Report",blocks:[{type:"paragraph",text:status.documentText}],references:[]})
 });
 const underlying=createPrivateAiExportStore({metadata,objects,clock:()=>1000});
 const guarded=createRevocationAwareAiExportStore({store:underlying,loadAuthorizedMessage:source});
 const service=createAiExportService({enabled:true,store:guarded,clock:()=>1000,loadMessage:source,render:async()=>bytes});
 return {status,service,guarded,counters:()=>({blobReads,blobWrites}),job:()=>job};
}
test("private document is downloadable while original message remains authorized and unchanged",async()=>{
 const x=system();
 const created=await x.service.create(request,identity);
 assert.equal(created.ok,true,JSON.stringify(created));
 assert.equal((await x.service.download(created.id,identity)).ok,true);
 assert.deepEqual(x.counters(),{blobReads:1,blobWrites:1});
});
test("revoke membership after creation: no stored bytes are accessed",async()=>{
 const x=system(),created=await x.service.create(request,identity);
 assert.equal(created.ok,true);
 x.status.allowed=false;
 const download=await x.service.download(created.id,identity);
 assert.equal(download.ok,false);
 assert.equal(x.counters().blobReads,0);
 assert.equal(await x.guarded.get({id:created.id,tenantId:"tenant1",actorId:"user1"}),null);
});
test("editing or deleting the source message after export invalidates download",async()=>{
 for(const kind of ["edit","delete","error"]){
  const x=system(),created=await x.service.create(request,identity);
  assert.equal(created.ok,true);
  if(kind==="edit")x.status.documentText="New content P 2,250";
  if(kind==="delete")x.status.deleted=true;
  if(kind==="error")x.status.error=true;
  const result=await x.service.download(created.id,identity);
  assert.equal(result.ok,false,kind);
  assert.equal(x.counters().blobReads,0);
  assert.equal(JSON.stringify(result).includes("secret"),false);
 }
});
test("forged actor and tenant identifiers never return a stored document",async()=>{
 const x=system(),created=await x.service.create(request,identity);
 for(const foreign of [{...identity,actorId:"another"},{...identity,tenantId:"foreign"}]){
  const result=await x.service.download(created.id,foreign);
  assert.equal(result.ok,false);
 }
 assert.equal(x.counters().blobReads,0);
});
test("recheck after object read denies bytes when membership revoked mid-fetch",async()=>{
 const x=system(),created=await x.service.create(request,identity);
 assert.equal(created.ok,true);
 x.status.revokeOnRead=true;
 const result=await x.service.download(created.id,identity);
 assert.equal(result.ok,false);
 assert.equal(x.counters().blobReads,1);
});
test("revocation while document is being rendered blocks marking export complete",async()=>{
 const x=system();
 const onRender=createAiExportService({
  enabled:true,store:x.guarded,clock:()=>1000,
  loadMessage:createAuthorizedAiExportMessageLoader({
   readConversation:async()=>({id:"conv1",tenantId:"tenant1"}),
   canReadConversation:async()=>x.status.allowed,
   readMessage:async()=>({id:"msg1",tenantId:"tenant1",conversationId:"conv1",role:"assistant",isFinal:true}),
   documentForMessage:async()=>({title:"Report",blocks:[{type:"paragraph",text:x.status.documentText}],references:[]})
  }),
  render:async()=>{x.status.allowed=false;return Buffer.from("%PDF-test")}
 });
 const created=await onRender.create(request,identity);
 assert.equal(created.ok,false);
 assert.equal(created.reason,"render_failed");
 assert.equal(x.counters().blobWrites,0);
});
test("invalid trusted dependencies fail before any job or storage access",()=>{
 assert.throws(()=>createRevocationAwareAiExportStore({}),/revocation_aware_export_dependencies_required/);
});
