/**
 * Quotation SQL migration qualification against the *local* Cloudflare D1
 * runtime. Never uses Cloudflare API credentials, remote resources, customer
 * data, production DB bindings, or public quotation endpoints.
 *
 * This test cannot authorize SQL execution on bw-quotation-staging. It
 * validates both exact immutable source blobs and the real D1 runtime
 * response/constraint semantics against isolated synthetic tenants.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {splitSqliteMigrationStatements} from "../scripts/sqlite-migration-statements.mjs";
import {createQuotationLogoStore} from "../server/quotation-logo-d1-r2-store.mjs";
import {createQuotationDraftD1Store} from "../server/quotation-draft-d1-store.mjs";

const APPROVED=Object.freeze([
 {path:"../docs/sql/quotation-logo-staging-candidate.sql",
  gitBlob:"6d9527d1184603cbaafbf70c999615c8784b7708",
  statements:2},
 {path:"../docs/sql/quotation-drafts-staging-candidate.sql",
  gitBlob:"9aa86a3282d34707b3aa056b8ec1e1f6ccef5ce1",
  statements:2}
]);
function exactStatements(entry){
 const bytes=readFileSync(new URL(entry.path,import.meta.url));
 const digest=createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
 assert.equal(digest,entry.gitBlob,"unreviewed quotation SQL bytes; abort test");
 const source=bytes.toString("utf8");
 const statements=splitSqliteMigrationStatements(source);
 assert.equal(statements.length,entry.statements);
 for(const sql of statements){
  const withoutComments=sql.replace(/--[^\n]*/g,"").trim();
  assert.match(withoutComments,/^CREATE (TABLE|INDEX) /);
  assert.doesNotMatch(withoutComments,/\b(DROP|ALTER|ATTACH|PRAGMA|INSERT|UPDATE|DELETE|REPLACE)\b/i);
  assert.doesNotMatch(withoutComments,/IF NOT EXISTS/i);
 }
 return statements;
}
async function fixture(t){
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,
  script:'export default {fetch(){return new Response("unmounted synthetic quotation D1")}}',
  compatibilityDate:"2026-09-25",
  d1Databases:{DB:"quotation-staging-sql-local-only"}
 }));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database("DB");
 const before=await db.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '_cf_KV' ORDER BY name").all();
 assert.deepEqual(before.results,[],"isolation requires clean local application schema");
 return db;
}
async function applyExactly(db){
 for(const entry of APPROVED)for(const sql of exactStatements(entry)){
  const result=await db.prepare(sql).run();
  assert.equal(result.success,true);
 }
}
const draft=()=>({
 quoteNumber:"SYN-D1",issueDate:"2026-11-16",
 customerName:"Synthetic Staff",customerContact:"Gaborone Test Only",
 paymentMethod:"Manual",items:[
  {description:"Synthetic memorial",quantity:2,unitPriceCents:125000}
 ],discountCents:5000
});
function privateR2(){
 const objects=new Map();
 return {objects,bucket:{
  async put(key,data){objects.set(key,data.slice())},
  async get(key){const bytes=objects.get(key);return bytes?{
   size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)
  }:null},
  async delete(key){objects.delete(key)}
 }};
}
test("both reviewed SQL blobs create only the expected tables/index on local workerd D1",async t=>{
 const db=await fixture(t);
 await applyExactly(db);
 const x=await db.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '_cf_KV' ORDER BY type,name").all();
 assert.deepEqual(x.results,[
  {name:"idx_quotation_drafts_tenant_updated",type:"index"},
  {name:"quotation_drafts",type:"table"},
  {name:"quotation_logo_assets",type:"table"},
  {name:"quotation_logo_settings",type:"table"}
 ]);
 const fk=await db.prepare("PRAGMA foreign_key_list('quotation_logo_settings')").all();
 assert.deepEqual(fk.results.map(x=>[x.from,x.to]).sort(),[
  ["asset_id","id"],["tenant_id","tenant_id"]
 ]);
 await assert.rejects(db.prepare(exactStatements(APPROVED[0])[0]).run(),
  "replaying a migration must fail rather than silently accepting old schema");
});
test("real local D1 enforces logo composite FK and private tenant-scoped R2 keys",async t=>{
 const db=await fixture(t);await applyExactly(db);
 const r2=privateR2();
 const store=createQuotationLogoStore({db,bucket:r2.bucket});
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
 const uploaded=await store.writePrivateAsset({
  companyId:"tenantA",mimeType:"image/png",bytes,width:200,height:100
 });
 assert.match(uploaded.logoAssetId,/^[a-f0-9]{32}$/);
 const key="quotation-logos/tenantA/"+uploaded.logoAssetId;
 assert.equal(r2.objects.has(key),true);
 assert.equal(await store.readPrivateAsset({companyId:"tenantB",logoAssetId:uploaded.logoAssetId}),null);
 assert.equal((await store.readPrivateAsset({
  companyId:"tenantA",logoAssetId:uploaded.logoAssetId
 })).aspectRatio,2);
 await store.upsertCompanyLogoSettings({
  companyId:"tenantA",settings:{companyId:"tenantA",
   logoAssetId:uploaded.logoAssetId,
   layout:{xPercent:4,yPercent:2,widthPercent:20}}
 });
 assert.equal((await store.getCompanyLogoSettings({companyId:"tenantA"})).layout.widthPercent,20);
 assert.equal(await store.getCompanyLogoSettings({companyId:"tenantB"}),null);
 // A tenant cannot point its settings at another tenant's asset.
 await assert.rejects(db.prepare(
  "INSERT INTO quotation_logo_settings (tenant_id,asset_id,x_percent,y_percent,width_percent) VALUES (?,?,?,?,?)"
 ).bind("tenantB",uploaded.logoAssetId,4,2,20).run());
 await assert.rejects(db.prepare(
  "INSERT INTO quotation_logo_assets (id,tenant_id,object_key,mime_type,width,height,aspect_ratio) VALUES (?,?,?,?,?,?,?)"
 ).bind("bad","tenantB","quotation-logos/tenantA/bad","image/png",200,100,2).run());
 assert.equal(r2.objects.size,1);
});
test("draft adapter uses real D1 optimistic CAS and preserves company separation",async t=>{
 const db=await fixture(t);await applyExactly(db);
 const storage=createQuotationDraftD1Store({db});
 assert.deepEqual(await storage.save({
  companyId:"tenantA",draftId:"same",expectedRevision:0,draft:draft()
 }),{revision:1});
 assert.deepEqual(await storage.save({
  companyId:"tenantB",draftId:"same",expectedRevision:0,
  draft:{...draft(),customerName:"Other Synthetic"}
 }),{revision:1});
 assert.equal((await storage.read({companyId:"tenantA",draftId:"same"})).draft.customerName,"Synthetic Staff");
 assert.equal((await storage.read({companyId:"tenantB",draftId:"same"})).draft.customerName,"Other Synthetic");
 const updateA={...draft(),customerName:"Committed Writer One"};
 const updateB={...draft(),customerName:"Rejected Stale Writer"};
 const [first,second]=await Promise.all([
  storage.save({companyId:"tenantA",draftId:"same",expectedRevision:1,draft:updateA}),
  storage.save({companyId:"tenantA",draftId:"same",expectedRevision:1,draft:updateB})
 ]);
 assert.equal([first,second].filter(x=>x.revision===2).length,1);
 assert.equal([first,second].filter(x=>x.conflict===true).length,1);
 const saved=await storage.read({companyId:"tenantA",draftId:"same"});
 assert.equal(saved.revision,2);
 assert.ok(["Committed Writer One","Rejected Stale Writer"].includes(saved.draft.customerName));
 assert.equal((await storage.read({companyId:"tenantB",draftId:"same"})).revision,1);
 await assert.rejects(db.prepare(
  "INSERT INTO quotation_drafts (tenant_id,id,revision,draft_json) VALUES (?,?,?,?)"
 ).bind("tenantA","corrupt",1,"{broken JSON").run());
});
