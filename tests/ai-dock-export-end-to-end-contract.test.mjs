import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiDockExportIntegration} from "../server/ai-dock-export-integration.js";
import {createPrivateAiExportStore} from "../server/ai-document-export-private-store.js";
const actor={authenticated:true,workspaceMember:true,tenantId:"tenant1",actorId:"user1"};
const request={conversationId:"conv1",messageId:"msg1",format:"pdf",documentType:"report"};
const content={authorized:true,actorRole:"assistant",contentHash:"a".repeat(64),document:{title:"Botswana payroll",blocks:[{type:"paragraph",text:"P 3,500"}],references:[]}};
function system(){
 let job=null;const objects=new Map();let serial=0;
 const store=createPrivateAiExportStore({clock:()=>1000,metadata:{
  insert:async input=>(job={...input,id:"job"+(++serial)}),
  find:async query=>job?.id===query.id?job:null,
  complete:async update=>{job={...job,...update}}
 },objects:{put:async(k,bytes)=>objects.set(k,bytes),get:async k=>objects.get(k)}});
 const make=(identity=actor,enabled=false)=>createAiDockExportIntegration({enabled,identityFor:async()=>identity,store,loadMessage:async()=>content,render:async()=>Buffer.from("%PDF-integrated"),clock:()=>1000});
 return {make,objects};
}
test("end-to-end simulated storage path stays disabled unless enabled",async()=>{
 const {make,objects}=system();
 assert.equal((await make().create({body:request})).reason,"export_disabled");
 assert.equal(objects.size,0);
});
test("authenticated user can create and privately retrieve simulated export",async()=>{
 const {make,objects}=system();const api=make(actor,true);
 const created=await api.create({body:request});assert.equal(created.ok,true);
 const downloaded=await api.download({params:{id:created.id}});assert.equal(downloaded.ok,true);
 assert.equal(downloaded.bytes.toString(),"%PDF-integrated");
 assert.equal(objects.size,1);
});
test("foreign actor or tenant cannot download simulated stored bytes",async()=>{
 const {make}=system();const owner=make(actor,true);
 const created=await owner.create({body:request});assert.equal(created.ok,true);
 for(const foreign of [{...actor,actorId:"user2"},{...actor,tenantId:"tenant2"}]){
  const denied=await make(foreign,true).download({params:{id:created.id}});assert.equal(denied.ok,false);
 }
});
