import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {createAiExportD1Metadata} from "../server/ai-export-d1-metadata.js";
const ddl=readFileSync(new URL("../docs/ai-export-d1-schema-candidate.sql",import.meta.url),"utf8");
function sqliteAsD1(){
 const engine=new DatabaseSync(":memory:");engine.exec(ddl);
 const db={prepare(sql){const statement=engine.prepare(sql);
  return {bind(...params){return {
   async run(){const result=statement.run(...params);return {success:true,meta:{changes:result.changes}}},
   async first(){return statement.get(...params)||null},
   async all(){return {success:true,results:statement.all(...params)}}
  }}};
 }};
 return {db,engine};
}
const source={tenantId:"org1",actorId:"user1",conversationId:"thread1",messageId:"response1",contentHash:"a".repeat(64),format:"pdf",documentType:"report",createdAt:1000,expiresAt:2000};
test("candidate SQL schema supports durable metadata lifecycle and scoped reads",async()=>{
 const {db,engine}=sqliteAsD1();
 try {
  const adapter=createAiExportD1Metadata({db,clock:()=>1000,makeId:()=>"export1"});
  const created=await adapter.insert(source);
  assert.equal(created.status,"queued");
  assert.equal(await adapter.find({id:"export1",tenantId:"org2",actorId:"user1"}),null);
  assert.equal(await adapter.find({id:"export1",tenantId:"org1",actorId:"user2"}),null);
  await adapter.complete({id:"export1",tenantId:"org1",actorId:"user1",objectKey:"ai-exports/org1/export1",status:"completed"});
  const completed=await adapter.find({id:"export1",tenantId:"org1",actorId:"user1"});
  assert.equal(completed.status,"completed");
  assert.equal(completed.objectKey,"ai-exports/org1/export1");
  await assert.rejects(adapter.complete({id:"export1",tenantId:"org1",actorId:"user1",objectKey:"ai-exports/org1/export1",status:"completed"}),/private_export_metadata_conflict/);
  const expired=await adapter.listExpired({before:2000,limit:10});
  assert.equal(expired.length,1);
  assert.equal(expired[0].id,"export1");
 } finally {engine.close()}
});
test("SQL constraints refuse invalid formats, incomplete completed rows and expiry inversions",()=>{
 const {engine}=sqliteAsD1();
 try {
  const sql="INSERT INTO ai_document_export_jobs (id, tenant_id, actor_id, conversation_id, message_id, content_hash, format, document_type, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  const add=engine.prepare(sql);
  assert.throws(()=>add.run("x","t1","a1","c1","m1","a".repeat(64),"exe","report","queued",1000,2000));
  assert.throws(()=>add.run("y","t1","a1","c1","m1","a".repeat(64),"pdf","report","completed",1000,2000));
  assert.throws(()=>add.run("z","t1","a1","c1","m1","a".repeat(64),"pdf","report","queued",2000,1000));
 } finally {engine.close()}
});
