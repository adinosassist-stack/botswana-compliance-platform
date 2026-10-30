import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiExportPersistence} from "../server/ai-export-persistence-composition.js";
import {createAiExportService} from "../server/ai-document-export-service.js";
function fakeEnvironment(){
 const rows=new Map(),blobs=new Map();let writes=0;
 const db={prepare(sql){return {bind(...params){return {
  async run(){
   if(sql.startsWith("INSERT INTO")){const [id,tenantId,actorId,conversationId,messageId,contentHash,format,documentType,createdAt,expiresAt]=params;
    if(rows.has(id))return {success:true,meta:{changes:0}};
    rows.set(id,{id,tenant_id:tenantId,actor_id:actorId,conversation_id:conversationId,message_id:messageId,content_hash:contentHash,format,document_type:documentType,status:"queued",object_key:null,created_at:createdAt,expires_at:expiresAt});
    return {success:true,meta:{changes:1}}}
   if(sql.startsWith("UPDATE")){const [key,id,tenant,actor,now]=params,row=rows.get(id);
    if(!row||row.tenant_id!==tenant||row.actor_id!==actor||row.status!=="queued"||row.expires_at<=now)return {success:true,meta:{changes:0}};
    row.object_key=key;row.status="completed";return {success:true,meta:{changes:1}}}
   throw Error("unexpected SQL");
  },
  async first(){const [id,tenant,actor]=params,row=rows.get(id);return row&&row.tenant_id===tenant&&row.actor_id===actor?{...row}:null},
  async all(){return {success:true,results:[]}}
 }}}}};
 const r2Binding={
  async put(key,bytes,opts){writes++;blobs.set(key,{bytes,opts})},
  async get(key){const b=blobs.get(key);return b?{size:b.bytes.length,customMetadata:b.opts.customMetadata,arrayBuffer:async()=>b.bytes}:null}
 };
 return {db,r2Binding,evidenceBinding:{},rows,blobs,getWrites:()=>writes};
}
const identity={authenticated:true,workspaceMember:true,tenantId:"tenant1",actorId:"actor1"};
const request={conversationId:"conv1",messageId:"msg1",format:"pdf",documentType:"report"};
test("composition is default-off for any nonliteral activation",()=>{
 const fake=fakeEnvironment();
 for(const enabled of [undefined,false,"true",1,null]){
  const candidate=createAiExportPersistence({enabled,...fake,bucketName:"private",clock:()=>1000});
  assert.equal(candidate.enabled,false);assert.equal(candidate.store,null);
 }
 assert.equal(fake.getWrites(),0);
});
test("explicit activation refuses missing durable bindings",()=>{
 assert.throws(()=>createAiExportPersistence({enabled:true}),/private_export_bindings_required/);
});
test("trusted D1-R2 composition safely executes create and private download",async()=>{
 const env=fakeEnvironment();
 const p=createAiExportPersistence({enabled:true,...env,bucketName:"private",clock:()=>1000,makeId:()=>"job1"});
 const api=createAiExportService({enabled:true,store:p.store,clock:()=>1000,
  loadMessage:async()=>({authorized:true,actorRole:"assistant",contentHash:"a".repeat(64),
   document:{title:"Thebe report",blocks:[{type:"paragraph",text:"Amount P 100"}],references:[]}}),
  render:async()=>Buffer.from("%PDF-test")});
 const created=await api.create(request,identity);
 assert.equal(created.ok,true,JSON.stringify(created));
 assert.equal(env.getWrites(),1);assert.equal(env.blobs.size,1);
 const own=await api.download(created.id,identity);
 assert.equal(own.ok,true,JSON.stringify(own));assert.equal(own.bytes.toString(),"%PDF-test");
 const foreign=await api.download(created.id,{...identity,actorId:"other"});
 assert.equal(foreign.ok,false);
 const otherTenant=await api.download(created.id,{...identity,tenantId:"other"});
 assert.equal(otherTenant.ok,false);
 assert.equal(env.rows.get(created.id).status,"completed");
 assert.equal(env.blobs.get("ai-exports/tenant1/job1").opts.customMetadata.expiresAt,"3601000");
});

test("enabled composition refuses evidence bucket reuse or missing comparison binding",()=>{
 const env=fakeEnvironment();
 assert.throws(()=>createAiExportPersistence({enabled:true,db:env.db,r2Binding:env.r2Binding,bucketName:"private",clock:()=>1000}),/private_export_bindings_required/);
 assert.throws(()=>createAiExportPersistence({enabled:true,...env,evidenceBinding:env.r2Binding,bucketName:"private",clock:()=>1000}),/private_export_bindings_required/);
 assert.equal(env.getWrites(),0);
});

test("D1/R2 export cannot download altered bytes even if stored job remains completed",async()=>{
 const env=fakeEnvironment();
 const p=createAiExportPersistence({enabled:true,...env,bucketName:"private",clock:()=>1000,makeId:()=>"integrity1"});
 const api=createAiExportService({enabled:true,store:p.store,clock:()=>1000,
  loadMessage:async()=>({authorized:true,actorRole:"assistant",contentHash:"b".repeat(64),
   document:{title:"Document",blocks:[{type:"paragraph",text:"Private report"}],references:[]}}),
  render:async()=>Buffer.from("%PDF-original")});
 const created=await api.create(request,identity);
 assert.equal(created.ok,true);
 assert.equal((await api.download(created.id,identity)).ok,true);
 const key="ai-exports/tenant1/integrity1";
 const object=env.blobs.get(key);
 assert.match(object.opts.customMetadata.sha256,/^[a-f0-9]{64}$/);
 object.bytes=Buffer.from("%PDF-corrupt!"); // Same size, changed content.
 const invalid=await api.download(created.id,identity);
 assert.equal(invalid.ok,false);
 assert.equal(invalid.reason,"not_ready");
 assert.equal(env.rows.get(created.id).status,"completed"); // Not silently rewritten.
});
