import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiExportStagingRetention} from "../server/ai-export-staging-retention.js";
const now=4*3600000,old=now-2*3600000;
const makeRow=(id="job1",other={})=>({
 id,tenantId:"tenant1",actorId:"actor1",status:"completed",
 objectKey:"ai-exports/tenant1/"+id,expiresAt:old,...other
});
function setup({rows=[makeRow()],current=null,scanError=false,findError=false,deleteError=false}={}){
 const events=[],objects=new Set(rows.map(x=>x.objectKey));
 const metadata={
  async listExpired({before,limit}){events.push(["scan",before,limit]);if(scanError)throw Error("db password");return rows},
  async find(args){events.push(["find",args]);if(findError)throw Error("secret db");
   const found=rows.find(x=>x.id===args.id&&x.tenantId===args.tenantId&&x.actorId===args.actorId);
   return current??found??null}
 };
 const exportBinding={async delete(key){events.push(["delete",key]);if(deleteError)throw Error("secret r2");objects.delete(key)}};
 const evidenceBinding={async delete(){throw Error("evidence bucket must never be used")}};
 const cleanup=createAiExportStagingRetention({enabled:true,environment:"isolated-staging",metadata,exportBinding,evidenceBinding,clock:()=>now});
 return {cleanup,events,objects,metadata,exportBinding,evidenceBinding};
}
test("default-off and truthy string never touch a database or bucket",async()=>{
 for(const enabled of [undefined,false,"true",1,null]){
  const c=createAiExportStagingRetention({enabled,metadata:{listExpired:()=>{throw Error("called")}}});
  const r=await c.run({dryRun:false,approval:true,confirmation:"DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING"});
  assert.equal(r.reason,"retention_disabled");assert.equal(r.deleted,0);
 }
});
test("only isolated staging with separate export and evidence bindings can be enabled",()=>{
 const x=setup();
 for(const environment of ["production","staging","local",undefined]){
  assert.throws(()=>createAiExportStagingRetention({enabled:true,environment,metadata:x.metadata,exportBinding:x.exportBinding,evidenceBinding:x.evidenceBinding}),/isolated_retention_dependencies_required/);
 }
 assert.throws(()=>createAiExportStagingRetention({enabled:true,environment:"isolated-staging",metadata:x.metadata,exportBinding:x.exportBinding,evidenceBinding:x.exportBinding}),/isolated_retention_dependencies_required/);
});
test("read-only default scans scoped, expired jobs without deleting anything",async()=>{
 const x=setup();
 const r=await x.cleanup.run();
 assert.equal(r.ok,true);assert.equal(r.mode,"read_only");assert.equal(r.eligible,1);assert.equal(r.deleted,0);
 assert.deepEqual(x.events.map(e=>e[0]),["scan","find"]);
 assert.equal(x.objects.size,1);
});
test("only literal approval plus exact confirmation allows deletion",async()=>{
 const x=setup();
 for(const args of [{dryRun:false},{dryRun:false,approval:"true",confirmation:"DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING"},{dryRun:false,approval:true,confirmation:"WRONG"}]){
  const r=await x.cleanup.run(args);
  assert.equal(r.deleted,0);assert.equal(r.reason,"explicit_staging_delete_approval_required");
 }
 assert.equal(x.events.length,0);
 for(const dryRun of ["false","true",0,1,null]){
  const denied=await x.cleanup.run({dryRun,approval:true,confirmation:"DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING"});
  assert.equal(denied.reason,"invalid_retention_mode");
 }
 assert.equal(x.events.length,0);
 const yes=await x.cleanup.run({dryRun:false,approval:true,confirmation:"DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING"});
 assert.equal(yes.deleted,1);assert.equal(yes.ok,true);assert.equal(x.objects.size,0);
 assert.deepEqual(x.events.map(e=>e[0]),["scan","find","delete"]);
});
test("corrupt, foreign, queued, too-new or manipulated rows are never deleted",async()=>{
 const list=[
  makeRow("ok"),
  makeRow("foreign",{objectKey:"ai-exports/another/foreign"}),
  makeRow("traversal",{tenantId:"../private"}),
  makeRow("dot",{tenantId:"..",objectKey:"ai-exports/../dot"}),
  makeRow("queued",{status:"queued"}),
  makeRow("recent",{expiresAt:now-1000}),
  makeRow("invalid",{objectKey:"ai-exports/tenant1/something-else"})
 ];
 const x=setup({rows:list});
 const r=await x.cleanup.run({dryRun:false,approval:true,confirmation:"DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING"});
 assert.equal(r.eligible,1);assert.equal(r.deleted,1);assert.equal(r.invalid,6);
 assert.deepEqual(x.events.filter(e=>e[0]==="delete").map(e=>e[1]),["ai-exports/tenant1/ok"]);
});
test("fresh metadata recheck prevents delete after changed status, expiry or owner",async()=>{
 for(const change of [{status:"queued"},{expiresAt:now+100000},{actorId:"different"},{objectKey:"ai-exports/foreign/j1"}]){
  const x=setup({current:makeRow("job1",change)});
  const r=await x.cleanup.run({dryRun:false,approval:true,confirmation:"DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING"});
  assert.equal(r.deleted,0);assert.equal(r.invalid,1);assert.equal(x.objects.size,1);
 }
});
test("scanner, metadata, and bucket errors fail closed without leaking secrets",async()=>{
 for(const config of [{scanError:true},{findError:true},{deleteError:true}]){
  const x=setup(config);
  const r=await x.cleanup.run({dryRun:false,approval:true,confirmation:"DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING"});
  assert.equal(r.deleted,0);assert.equal(r.ok,false);
  assert.equal(JSON.stringify(r).includes("secret"),false);
 }
});
test("bounded scan and retention grace reject invalid requests and excessive rows",async()=>{
 const x=setup({rows:Array.from({length:26},(_,i)=>makeRow("j"+i))});
 assert.equal((await x.cleanup.run({limit:26})).reason,"invalid_retention_limit");
 const r=await x.cleanup.run({limit:25});
 assert.equal(r.reason,"invalid_retention_scan");assert.equal(r.deleted,0);
 assert.equal(x.events.some(e=>e[0]==="delete"),false);
});
