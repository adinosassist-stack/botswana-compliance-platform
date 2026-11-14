import test from "node:test";
import assert from "node:assert/strict";
import { qualifyWorkspaceAgentPostgresReadOnly } from "../server/workspace-agent-postgres-readonly-qualification.js";

const expectedColumns=[
  ["id","uuid"],["tenant_id","uuid"],["objective","text"],
  ["workspace","text"],["status","text"],["updated_at","timestamp with time zone"]
].map(([column_name,data_type])=>({column_name,data_type,is_nullable:"NO"}));
const indexdef="CREATE INDEX idx_agent_responsibilities_scope ON public.agent_responsibilities USING btree (tenant_id, workspace, status, updated_at DESC)";
function harness({columns=expectedColumns,permission={
  can_select:true,can_insert:false,can_update:false,can_delete:false
},indexes=[{indexdef}],throwAt=-1}={}) {
  const calls=[];
  const pool={query:async(sql,params)=>{
    assert.match(sql.trim(),/^SELECT\b/i);
    assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\s+/i);
    assert.deepEqual(params,["public","agent_responsibilities"]);
    calls.push({sql,params});
    if(calls.length===throwAt)throw Error("connection unavailable");
    if(sql.includes("information_schema.columns"))return {rows:columns};
    if(sql.includes("has_table_privilege"))return {rows:[permission]};
    if(sql.includes("pg_catalog.pg_indexes"))return {rows:indexes};
    throw Error("unexpected query");
  }};
  return {pool,calls};
}
test("fails closed with missing pool or unapproved schema",async()=>{
 const absent=await qualifyWorkspaceAgentPostgresReadOnly();
 assert.equal(absent.ok,false);
 assert.equal(absent.readyForStagingDeployment,false);
 const other=await qualifyWorkspaceAgentPostgresReadOnly({pool:harness().pool,schema:"production"});
 assert.equal(other.code,"isolated_public_schema_required");
});
test("private staging SELECT-only schema may pass metadata but never authorize deploy",async()=>{
 const h=harness();
 const r=await qualifyWorkspaceAgentPostgresReadOnly({pool:h.pool});
 assert.equal(r.ok,true,JSON.stringify(r.checks.filter(x=>!x.passed)));
 assert.equal(r.schemaQualified,true);
 assert.equal(r.readOnlyPrivilegeQualified,true);
 assert.equal(r.readyForStagingDeployment,false);
 assert.equal(r.productionActivationAuthorized,false);
 assert.equal(h.calls.length,3);
});
test("missing column, mismatched type and nullable scope block qualification",async()=>{
 for(const columns of [
  expectedColumns.filter(x=>x.column_name!=="tenant_id"),
  expectedColumns.map(x=>x.column_name==="updated_at"?{...x,data_type:"jsonb"}:x),
  expectedColumns.map(x=>x.column_name==="tenant_id"?{...x,is_nullable:"YES"}:x)
 ]) {
  const result=await qualifyWorkspaceAgentPostgresReadOnly({pool:harness({columns}).pool});
  assert.equal(result.ok,false);
  assert.equal(result.schemaQualified,false);
 }
});
test("read-only staging identity must have SELECT and no DML privilege",async()=>{
 for(const permission of [
  {can_select:false,can_insert:false,can_update:false,can_delete:false},
  {can_select:true,can_insert:true,can_update:false,can_delete:false},
  {can_select:true,can_insert:false,can_update:true,can_delete:false},
  {can_select:true,can_insert:false,can_update:false,can_delete:true},
  {can_select:true,can_insert:null,can_update:false,can_delete:false}
 ]) {
  const result=await qualifyWorkspaceAgentPostgresReadOnly({pool:harness({permission}).pool});
  assert.equal(result.ok,false);
  assert.equal(result.readOnlyPrivilegeQualified,false);
 }
});
test("tenant-first bounded query index is required",async()=>{
 for(const indexes of [[],[{indexdef:"CREATE INDEX foo ON agent_responsibilities (workspace,tenant_id,status,updated_at DESC)"}]]) {
  const result=await qualifyWorkspaceAgentPostgresReadOnly({pool:harness({indexes}).pool});
  assert.equal(result.ok,false);
  assert.equal(result.schemaQualified,false);
 }
});
test("metadata connection failure does not leak exception or attempt writes",async()=>{
 for(const throwAt of [1,2,3]){
  const h=harness({throwAt});
  const result=await qualifyWorkspaceAgentPostgresReadOnly({pool:h.pool});
  assert.equal(result.ok,false);
  assert.equal(result.code,"readonly_metadata_unavailable");
  assert.equal(result.readyForStagingDeployment,false);
  assert.equal(h.calls.length,throwAt);
 }
});
