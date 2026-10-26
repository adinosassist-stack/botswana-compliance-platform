import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiExportService} from "../server/ai-document-export-service.js";
const actor={authenticated:true,workspaceMember:true,tenantId:"tenant1",actorId:"user1"};
const request={conversationId:"c1",messageId:"m1",format:"pdf",documentType:"report"};
const input={authorized:true,actorRole:"assistant",contentHash:"a".repeat(64),document:{title:"Thebe report",blocks:[{type:"paragraph",text:"Payroll P 3000"}],references:[]}};
const job={id:"job1",tenantId:"tenant1",actorId:"user1",status:"completed",format:"pdf",expiresAt:5000,title:"Thebe report",objectKey:"ai-exports/tenant1/job1"};
function setup({enabled=true,message=input,storedJob=job,read=Buffer.from("%PDF-test"),render=async()=>Buffer.from("%PDF-test")}={}){
 const calls={create:0,read:0,render:0};
 const store={create:async()=>{calls.create++;return storedJob},get:async()=>storedJob,complete:async()=>{},readPrivate:async()=>{calls.read++;return read}};
 return {service:createAiExportService({enabled,store,clock:()=>1000,loadMessage:async()=>message,render:async(...args)=>{calls.render++;return render(...args)}}),calls};
}
test("default-off refuses all operations without touching store",async()=>{
 const {service,calls}=setup({enabled:false});
 assert.equal((await service.create(request,actor)).reason,"export_disabled");
 assert.equal((await service.download("job1",actor)).reason,"export_disabled");
 assert.equal(calls.create,0);assert.equal(calls.read,0);
});
test("authorized job binds tenant, actor and server message hash",async()=>{
 const {service,calls}=setup();
 const result=await service.create(request,actor);
 assert.equal(result.ok,true);assert.equal(result.id,"job1");assert.equal(calls.render,1);
});
test("untrusted or missing source never creates a job",async()=>{
 for(const message of [null,{...input,authorized:false},{...input,actorRole:"user"},{...input,contentHash:"wrong"}]){
  const {service,calls}=setup({message});assert.equal((await service.create(request,actor)).ok,false);assert.equal(calls.create,0);
 }
});
test("download denies invalid identifiers, foreign actor, mismatched object and expiration",async()=>{
 const {service}=setup();
 assert.equal((await service.download("../job1",actor)).ok,false);
 assert.equal((await service.download("job1",{...actor,actorId:"other"})).ok,false);
 assert.equal((await setup({storedJob:{...job,objectKey:"ai-exports/other/path"}}).service.download("job1",actor)).ok,false);
 assert.equal((await setup({storedJob:{...job,expiresAt:999}}).service.download("job1",actor)).ok,false);
});
test("authorized private download returns attachment bytes only",async()=>{
 const {service,calls}=setup();
 const result=await service.download("job1",actor);
 assert.equal(result.ok,true);assert.match(result.headers["Content-Disposition"],/attachment/);assert.equal(calls.read,1);
});

test("export rejects oversized or invalid rendered bytes and never marks success",async()=>{
 for(const render of [async()=>Buffer.alloc(0),async()=>Buffer.alloc(20*1024*1024+1),async()=>null,async()=>{throw Error("renderer failed")}]) {
  const {service}=setup({render});
  const result=await service.create(request,actor);
  assert.equal(result.ok,false);
  assert.equal(result.reason,"render_failed");
 }
});
test("invalid input and unauthorized context are rejected before any message read or storage write",async()=>{
 const {service,calls}=setup();
 assert.equal((await service.create({...request,tenantId:"tenant2"},actor)).ok,false);
 assert.equal((await service.create(request,{...actor,workspaceMember:false})).ok,false);
 assert.equal(calls.create,0);
});
test("private storage failures do not expose error messages",async()=>{
 const service=createAiExportService({enabled:true,clock:()=>1000,
  loadMessage:async()=>input,render:async()=>Buffer.from("%PDF-test"),
  store:{create:async()=>{throw Error("database-password")},get:async()=>{throw Error("secret-store")},complete:async()=>{},readPrivate:async()=>{throw Error("secret-blob")}}
 });
 for(const result of [await service.create(request,actor),await service.download("job1",actor)]){
  assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes("secret"),false);
 }
});
