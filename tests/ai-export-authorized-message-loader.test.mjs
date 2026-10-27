import assert from "node:assert/strict";
import {test} from "node:test";
import {createAuthorizedAiExportMessageLoader} from "../server/ai-export-authorized-message-loader.js";
import {createAiExportService} from "../server/ai-document-export-service.js";
const ids={tenantId:"tenant1",actorId:"actor1",conversationId:"conv1",messageId:"message1"};
const conversation={id:"conv1",tenantId:"tenant1",deletedAt:null};
const message={id:"message1",conversationId:"conv1",tenantId:"tenant1",role:"assistant",isFinal:true};
const document={title:"Your report",blocks:[{type:"paragraph",text:"Cost P 1,200"}],references:[]};
function setup({conversationRow=conversation,messageRow=message,member=true,documentRow=document,throwAt=null}={}){
 const calls=[];
 const callbacks={
  readConversation:async args=>{calls.push(["conversation",args]);if(throwAt==="conversation")throw Error("secret-db");return conversationRow},
  canReadConversation:async args=>{calls.push(["membership",{tenantId:args.tenantId,actorId:args.actorId,conversationId:args.conversationId}]);if(throwAt==="membership")throw Error("secret-acl");return member},
  readMessage:async args=>{calls.push(["message",args]);if(throwAt==="message")throw Error("secret-message");return messageRow},
  documentForMessage:async args=>{calls.push(["document",{tenantId:args.tenantId,actorId:args.actorId}]);if(throwAt==="document")throw Error("secret-render");return documentRow}
 };
 return {load:createAuthorizedAiExportMessageLoader(callbacks),calls};
}
test("accepts only persisted, final assistant output following explicit current membership",async()=>{
 const {load,calls}=setup();
 const response=await load(ids);
 assert.equal(response.authorized,true);
 assert.equal(response.actorRole,"assistant");
 assert.match(response.contentHash,/^[a-f0-9]{64}$/);
 assert.deepEqual(response.document,document);
 assert.deepEqual(calls.map(x=>x[0]),["conversation","membership","message","document"]);
 assert.equal(calls[1][1].actorId,"actor1");
 assert.equal((await load(ids)).contentHash,response.contentHash);
});
test("rejects foreign, deleted or inconsistent conversation before reading message",async()=>{
 for(const conversationRow of [null,{...conversation,tenantId:"other"},{...conversation,id:"other"},{...conversation,deleted:true},{...conversation,deletedAt:42}]){
  const {load,calls}=setup({conversationRow});
  assert.equal(await load(ids),null);
  assert.deepEqual(calls.map(x=>x[0]),["conversation"]);
 }
});
test("requires literal membership permission before fetching message",async()=>{
 for(const member of [false,"true",1,null,undefined]){
  const {load,calls}=setup({member});
  assert.equal(await load(ids),null);
  assert.deepEqual(calls.map(x=>x[0]),["conversation","membership"]);
 }
});
test("rejects customer/system/streaming/deleted/mismatched assistant messages",async()=>{
 for(const messageRow of [null,{...message,role:"user"},{...message,role:"system"},{...message,isFinal:false},{...message,tenantId:"other"},{...message,conversationId:"other"},{...message,id:"other"},{...message,deleted:true}]){
  const {load,calls}=setup({messageRow});
  assert.equal(await load(ids),null);
  assert.deepEqual(calls.map(x=>x[0]),["conversation","membership","message"]);
 }
});
test("source errors and invalid documents fail closed without secret leakage",async()=>{
 for(const throwAt of ["conversation","membership","message","document"]){
  const response=await setup({throwAt}).load(ids);
  assert.equal(response,null);
 }
 assert.equal(await setup({documentRow:{title:"Invalid",blocks:[]}}).load(ids),null);
 assert.equal(await setup().load({...ids,tenantId:"../traversal"}),null);
 assert.equal(await setup().load({...ids,messageId:""}),null);
});
test("service creates job only for member-owned assistant message",async()=>{
 let creates=0,completed=0;
 const store={
  create:async data=>{creates++;return {...data,id:"export1",status:"queued"}},
  get:async()=>null,
  complete:async()=>{completed++},
  readPrivate:async()=>null
 };
 const identity={authenticated:true,workspaceMember:true,tenantId:"tenant1",actorId:"actor1"};
 const req={conversationId:"conv1",messageId:"message1",format:"pdf",documentType:"report"};
 const render=async()=>Buffer.from("%PDF-test");
 const service=createAiExportService({enabled:true,store,loadMessage:setup().load,render,clock:()=>1000});
 const good=await service.create(req,identity);
 assert.equal(good.ok,true,JSON.stringify(good));
 assert.equal(creates,1);assert.equal(completed,1);
 const denied=createAiExportService({enabled:true,store,loadMessage:setup({member:false}).load,render,clock:()=>1000});
 const invalid=await denied.create(req,identity);
 assert.equal(invalid.ok,false);assert.equal(invalid.reason,"message_not_found");
 assert.equal(creates,1);
});
