import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiDockExportIntegration} from "../server/ai-dock-export-integration.js";
const actor={authenticated:true,workspaceMember:true,tenantId:"t1",actorId:"u1"};
const request={conversationId:"c1",messageId:"m1",format:"pdf",documentType:"report"};
const document={authorized:true,actorRole:"assistant",contentHash:"a".repeat(64),document:{title:"Report",blocks:[{type:"paragraph",text:"P 500"}],references:[]}};
const job={id:"j1",tenantId:"t1",actorId:"u1",format:"pdf",status:"completed",expiresAt:9000,objectKey:"ai-exports/t1/j1"};
function adapter({enabled=false,identity=actor}={}){
 let calls=0;
 const store={create:async()=>{calls++;return job},get:async()=>{calls++;return job},complete:async()=>{},readPrivate:async()=>Buffer.from("%PDF-test")};
 const api=createAiDockExportIntegration({identityFor:async()=>identity,enabled,store,loadMessage:async()=>document,render:async()=>Buffer.from("%PDF-test"),clock:()=>1000});
 return {api,getCalls:()=>calls};
}
test("adapter is disabled by default without storage access",async()=>{
 const {api,getCalls}=adapter();
 assert.equal((await api.create({body:request})).reason,"export_disabled");
 assert.equal((await api.download({params:{id:"j1"}})).reason,"export_disabled");
 assert.equal(getCalls(),0);
});
test("explicit isolated enablement binds source identity and permits private download",async()=>{
 const {api}=adapter({enabled:true});
 assert.equal((await api.create({body:request})).ok,true);
 const result=await api.download({params:{id:"j1"}});
 assert.equal(result.ok,true);assert.equal(result.bytes.toString(),"%PDF-test");
});
test("foreign actor and caller-supplied tenant fail closed",async()=>{
 const {api}=adapter({enabled:true,identity:{...actor,actorId:"foreign"}});
 assert.equal((await api.download({params:{id:"j1"}})).ok,false);
 assert.equal((await api.create({body:{...request,tenantId:"t2"}})).ok,false);
});

test("truthy strings cannot activate exports",async()=>{
 let identityCalls=0;
 const api=createAiDockExportIntegration({enabled:"true",identityFor:async()=>{identityCalls++;return actor},store:{create:async()=>job,get:async()=>job,complete:async()=>{},readPrivate:async()=>Buffer.from("file")},loadMessage:async()=>document,render:async()=>Buffer.from("file"),clock:()=>1000});
 assert.equal((await api.create({body:request})).reason,"export_disabled");
 assert.equal((await api.download({params:{id:"j1"}})).reason,"export_disabled");
 assert.equal(identityCalls,0);
});
test("identity resolver failures and unauthenticated sessions fail closed",async()=>{
 for(const identityFor of [async()=>{throw Error("session-secret")},async()=>({...actor,authenticated:false})]){
  let storageCalls=0;
  const api=createAiDockExportIntegration({enabled:true,identityFor,store:{create:async()=>{storageCalls++;return job},get:async()=>{storageCalls++;return job},complete:async()=>{},readPrivate:async()=>Buffer.from("file")},loadMessage:async()=>document,render:async()=>Buffer.from("file"),clock:()=>1000});
  for(const result of [await api.create({body:request}),await api.download({params:{id:"j1"}})]){assert.equal(result.ok,false);assert.equal(result.reason,"unauthorized");}
  assert.equal(storageCalls,0);
 }
});
