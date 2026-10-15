import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {AGENT_COST_INSPECTION_SQL,inspectAgentCostSchema} from "./agent-cost-schema-preflight.mjs";

const manifest=JSON.parse(readFileSync(new URL("./manifests/agent-shadow-schema.json",import.meta.url),"utf8"));
const sha=value=>createHash("sha256").update(value).digest("hex");
const deny=(code,extra={})=>({ok:false,code,executionAllowed:false,migrationAllowed:false,...extra});
export const AGENT_SHADOW_INSPECTION_SQL=Object.freeze({
  ...AGENT_COST_INSPECTION_SQL,
  shadowObjects:"SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name",
  shadowColumns:"SELECT name FROM pragma_table_info('agentic_runs')"
});

// Inspection only: storage is supplied by the governed production transport.
export async function inspectAgentShadowSchema(query){
  if(typeof query!=="function")return deny("schema_inspection_unavailable");
  try{
    const source=readFileSync(new URL("../"+manifest.source.path,import.meta.url),"utf8");
    if(sha(source)!==manifest.source.sha256)return deny("schema_manifest_source_mismatch");
    const accounting=await inspectAgentCostSchema(query);
    if(!accounting.ok||accounting.code!=="accounting_schema_compatible")return deny("shadow_prerequisites_missing",{prerequisite:accounting.code});
    const objects=await query(AGENT_SHADOW_INSPECTION_SQL.shadowObjects);
    if(!Array.isArray(objects)||objects.some(r=>typeof r.name!=="string"||typeof r.type!=="string"))return deny("schema_inspection_unavailable");
    const runColumns=await query(AGENT_SHADOW_INSPECTION_SQL.shadowColumns);
    if(!objects.some(r=>r.type==="table"&&r.name==="agentic_runs")||
      !Array.isArray(runColumns)||!["id","tenant_id"].every(name=>runColumns.some(r=>r.name===name)))return deny("shadow_prerequisites_missing");
    const present=objects.filter(r=>r.sql!==null&&(r.name.startsWith("agent_cost_shadow_")||r.tbl_name==="agent_cost_shadow_events"));
    if(!present.length)return {ok:true,code:"shadow_schema_absent",executionAllowed:false,migrationAllowed:false};
    const missingObjects=manifest.objects.filter(e=>!present.some(r=>r.name===e.name&&r.type===e.type)).map(e=>e.name);
    const unexpectedObjects=present.filter(r=>!manifest.objects.some(e=>e.name===r.name&&e.type===r.type)).map(r=>r.name);
    const changedObjects=manifest.objects.filter(e=>{const row=present.find(r=>r.name===e.name&&r.type===e.type);
      return row&&(typeof row.sql!=="string"||sha(row.sql.trim())!==e.sqlSha256)}).map(e=>e.name);
    if(missingObjects.length||unexpectedObjects.length||changedObjects.length)return deny("shadow_schema_incompatible",{missingObjects,unexpectedObjects,changedObjects});
    return {ok:true,code:"shadow_schema_compatible",executionAllowed:false,migrationAllowed:false};
  }catch{return deny("schema_inspection_unavailable")}
}
