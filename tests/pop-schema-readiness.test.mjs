import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {observePopSchema} from "../cloudflare/src/pop-schema-readiness.js";

const doc=["id","tenant_id","payment_order_id","submission_id","source","object_key",
"display_name","content_type","bytes","scan_status","received_by_user_id","uploaded_at",
"deleted_at","content_sha256","object_etag","scan_request_id","scan_requested_at",
"scan_request_expires_at","scan_result_hash","scan_result_body","scan_result_signature",
"scanner_provider","scanned_at","last_owner_read_at","storage_deleted_at"];
const requests=["document_id","tenant_id","payment_order_id","key_hash","request_hash","bytes","state","created_at"];
const objs=["payment_pop_documents","payment_pop_upload_requests",
"payment_pop_documents_order_idx","payment_pop_documents_scan_idx",
"payment_pop_upload_requests_tenant_idx"].map((name,i)=>({name,type:i<2?"table":"index"}));
function fake({objects=objs,documentColumns=doc,requestColumns=requests,throws=false}={}){
 const queries=[];
 const DB={prepare(sql){queries.push(sql);return {async all(){
  if(throws)throw Error("private_provider_error");
  if(sql.includes("sqlite_master"))return {results:objects};
  if(sql.includes("payment_pop_documents"))return {results:documentColumns.map(name=>({name}))};
  if(sql.includes("payment_pop_upload_requests"))return {results:requestColumns.map(name=>({name}))};
  throw Error("unexpected_sql");
 }}}};
 return {DB,queries};
}
test("present POP schema is reported without writing data",async()=>{
 const e=fake(),value=await observePopSchema(e);
 assert.deepEqual(value,{popSchemaReady:true,popSchemaStatus:"present"});
 assert.equal(e.queries.length,3);
 for(const sql of e.queries){
  assert.match(sql,/^(SELECT|PRAGMA)\b/);
  assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
 }
});
test("missing production POP tables must not inherit declared migration label",async()=>{
 assert.deepEqual(await observePopSchema(fake({objects:[]})),{popSchemaReady:false,popSchemaStatus:"missing"});
});
test("partial 071 state and wrong index type fail closed",async()=>{
 assert.deepEqual(await observePopSchema(fake({documentColumns:doc.filter(x=>x!=="storage_deleted_at")})),
  {popSchemaReady:false,popSchemaStatus:"incomplete"});
 assert.deepEqual(await observePopSchema(fake({objects:objs.map(o=>o.name==="payment_pop_documents_scan_idx"?{...o,type:"table"}:o)})),
  {popSchemaReady:false,popSchemaStatus:"missing"});
});
test("D1 unavailable or query failure cannot report POP readiness",async()=>{
 assert.deepEqual(await observePopSchema({}),{popSchemaReady:false,popSchemaStatus:"unavailable"});
 assert.deepEqual(await observePopSchema(fake({throws:true})),{popSchemaReady:false,popSchemaStatus:"unavailable"});
});
test("worker readiness keeps core separate from optional POP schema",()=>{
 const source=readFileSync(new URL("../cloudflare/src/agentic-entry.js",import.meta.url),"utf8");
 assert.match(source,/await observePopSchema\(env\)/);
 assert.match(source,/latestSchemaDeltaMeaning:\s*"declared_release_tip"/);
 assert.match(source,/popSchemaReady:\s*pop\.popSchemaReady/);
 assert.match(source,/const schemaReady=coreSchemaReady&&authoritySchemaReady/);
});
