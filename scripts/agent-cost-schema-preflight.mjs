import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const manifest=JSON.parse(readFileSync(new URL("./manifests/agent-cost-schema.json",import.meta.url),"utf8"));
const sha=value=>createHash("sha256").update(value).digest("hex");
const prerequisites=Object.freeze({
  tenants:["id"],users:["id"],legal_holds:["id","tenant_id","status","active"],
  deletion_requests:["id","tenant_id","user_id","status","processing_token"],
  deletion_tombstones:["request_id","tenant_fingerprint"]
});
const prefix=name=>name.startsWith("agent_cost_")||name.startsWith("idx_agent_cost_");
const result=(code,extra={})=>({ok:false,code,executionAllowed:false,migrationAllowed:false,...extra});
export const AGENT_COST_INSPECTION_SQL=Object.freeze({
  objects:"SELECT type,name,sql FROM sqlite_master ORDER BY type,name",
  columns:Object.keys(prerequisites).map(table=>`SELECT '${table}' AS table_name,name FROM pragma_table_info('${table}')`).join(" UNION ALL "),
  foreignKeys:"PRAGMA foreign_key_check"
});

// Read-only inspection. This module neither selects a database nor applies SQL.
// The caller supplies a trusted query transport returning an array of rows.
export async function inspectAgentCostSchema(query){
  if(typeof query!=="function")return result("schema_inspection_unavailable");
  try{
    const source=readFileSync(new URL("../"+manifest.source.path,import.meta.url),"utf8");
    if(sha(source)!==manifest.source.sha256)return result("schema_manifest_source_mismatch");
    const objects=await query(AGENT_COST_INSPECTION_SQL.objects);
    if(!Array.isArray(objects)||objects.some(r=>typeof r.name!=="string"||typeof r.type!=="string"))return result("schema_inspection_unavailable");
    const missingTables=Object.keys(prerequisites).filter(name=>!objects.some(r=>r.type==="table"&&r.name===name));
    if(missingTables.length)return result("schema_prerequisites_missing",{missingTables});
    const columns=await query(AGENT_COST_INSPECTION_SQL.columns);
    if(!Array.isArray(columns))return result("schema_inspection_unavailable");
    const missingColumns=Object.entries(prerequisites).flatMap(([table,names])=>names
      .filter(name=>!columns.some(r=>r.table_name===table&&r.name===name)).map(name=>table+"."+name));
    if(missingColumns.length)return result("schema_prerequisites_missing",{missingColumns});
    const violations=await query(AGENT_COST_INSPECTION_SQL.foreignKeys);
    if(!Array.isArray(violations))return result("schema_inspection_unavailable");
    if(violations.length)return result("schema_foreign_key_violations",{violationCount:violations.length});
    const present=objects.filter(r=>prefix(r.name));
    if(!present.length)return {ok:true,code:"accounting_schema_absent",readyForReviewedFreshInstall:true,
      sourceSha256:manifest.source.sha256,executionAllowed:false,migrationAllowed:false};
    const expected=manifest.objects;
    const missingObjects=expected.filter(e=>!present.some(r=>r.name===e.name&&r.type===e.type)).map(e=>e.name);
    const unexpectedObjects=present.filter(r=>!expected.some(e=>e.name===r.name&&e.type===r.type)).map(r=>r.name);
    const changedObjects=expected.filter(e=>{const row=present.find(r=>r.name===e.name&&r.type===e.type);
      return row&&(typeof row.sql!=="string"||sha(row.sql.trim())!==e.sqlSha256)}).map(e=>e.name);
    if(missingObjects.length||unexpectedObjects.length||changedObjects.length)
      return result("accounting_schema_incompatible",{missingObjects,unexpectedObjects,changedObjects});
    return {ok:true,code:"accounting_schema_compatible",migrationRequired:false,
      sourceSha256:manifest.source.sha256,executionAllowed:false,migrationAllowed:false};
  }catch{return result("schema_inspection_unavailable")}
}
