import assert from "node:assert/strict";
import { test } from "node:test";
import { createAiExportD1Metadata } from "../server/ai-export-d1-metadata.js";
import { createPrivateAiExportStore } from "../server/ai-document-export-private-store.js";
function fakeD1() {
  const rows = new Map(), statements = [];
  return { rows, statements, prepare(sql) {
    statements.push(sql);
    return { bind(...args) { return {
      async run() {
        if (sql.startsWith("INSERT INTO")) {
          const [id,tenant,actor,conversation,message,hash,format,type,created,expires] = args;
          if(rows.has(id))return {success:false,meta:{changes:0}};
          rows.set(id,{id,tenant_id:tenant,actor_id:actor,conversation_id:conversation,message_id:message,content_hash:hash,format,document_type:type,status:"queued",object_key:null,created_at:created,expires_at:expires});
          return {success:true,meta:{changes:1}};
        }
        if (sql.startsWith("UPDATE")) {
          const [key,id,tenant,actor,now] = args, row=rows.get(id);
          if (!row || row.tenant_id!==tenant || row.actor_id!==actor || row.status!=="queued" || row.expires_at<=now) return {success:true,meta:{changes:0}};
          row.status="completed";row.object_key=key;
          return {success:true,meta:{changes:1}};
        }
        throw Error("unexpected SQL");
      },
      async first(){
        const [id,tenant,actor]=args,row=rows.get(id);
        return row?.tenant_id===tenant&&row?.actor_id===actor?{...row}:null;
      },
      async all() {
        const [before,limit]=args;
        return {success:true,results:[...rows.values()].filter(r=>r.expires_at<=before).sort((a,b)=>a.expires_at-b.expires_at).slice(0,limit)};
      }
    } }};
  }};
}
const sample={tenantId:"tenant1",actorId:"actor1",conversationId:"conv1",messageId:"msg1",contentHash:"a".repeat(64),format:"pdf",documentType:"report",createdAt:1000,expiresAt:2000};
test("D1 candidate adapter enforces tenant/actor-scoped reads and conditional finalization",async()=>{
 const db=fakeD1(),metadata=createAiExportD1Metadata({db,clock:()=>1000,makeId:()=>"job1"});
 const created=await metadata.insert(sample);
 assert.equal(created.id,"job1");
 assert.equal(await metadata.find({id:"job1",tenantId:"other",actorId:"actor1"}),null);
 assert.equal(await metadata.find({id:"job1",tenantId:"tenant1",actorId:"other"}),null);
 await assert.rejects(metadata.complete({id:"job1",tenantId:"tenant1",actorId:"other",objectKey:"ai-exports/tenant1/job1",status:"completed"}));
 await metadata.complete({id:"job1",tenantId:"tenant1",actorId:"actor1",objectKey:"ai-exports/tenant1/job1",status:"completed"});
 await assert.rejects(metadata.complete({id:"job1",tenantId:"tenant1",actorId:"actor1",objectKey:"ai-exports/tenant1/job1",status:"completed"}));
 assert.equal((await metadata.find({id:"job1",tenantId:"tenant1",actorId:"actor1"})).status,"completed");
 assert.equal(db.statements.every(sql=>!sql.includes("tenant1")&&!sql.includes("actor1")),true);
 assert.equal(db.statements.some(sql=>sql.includes("AND status = 'queued' AND expires_at > ?")),true);
});
test("D1 metadata works through private export-store boundary",async()=>{
 const db=fakeD1(),metadata=createAiExportD1Metadata({db,clock:()=>1000,makeId:()=>"job2"});
 const blobs=new Map(),store=createPrivateAiExportStore({metadata,clock:()=>1000,
  objects:{put:async(k,v)=>blobs.set(k,v),get:async k=>blobs.get(k)}});
 const job=await store.create(sample);
 await store.complete({tenantId:"tenant1",actorId:"actor1",id:job.id,objectKey:"ai-exports/tenant1/job2",bytes:Buffer.from("%PDF"),format:"pdf"});
 assert.equal((await store.readPrivate({tenantId:"tenant1",actorId:"actor1",id:"job2",objectKey:"ai-exports/tenant1/job2"})).toString(),"%PDF");
 assert.equal(await store.readPrivate({tenantId:"tenant1",actorId:"attacker",id:"job2",objectKey:"ai-exports/tenant1/job2"}),null);
 assert.equal((await metadata.listExpired({before:2000,limit:20})).length,1);
 assert.equal(blobs.size,1); // read-only retention scan does not delete
});
test("rejects invalid input, unbounded retention scans and wrong path",async()=>{
 const db=fakeD1(),metadata=createAiExportD1Metadata({db,clock:()=>1000,makeId:()=>"job3"});
 await assert.rejects(metadata.insert({...sample,tenantId:"../escape"}));
 assert.equal(db.statements.length,0);
 await metadata.insert(sample);
 await assert.rejects(metadata.complete({id:"job3",tenantId:"tenant1",actorId:"actor1",objectKey:"../secret",status:"completed"}));
 await assert.rejects(metadata.listExpired({before:2000,limit:101}));
});
