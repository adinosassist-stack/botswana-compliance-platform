import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {inspectAgentCostSchema} from "./agent-cost-schema-preflight.mjs";

const manifest=JSON.parse(readFileSync(new URL("./manifests/agent-cost-schema.json",import.meta.url),"utf8"));
const deny=(code,extra={})=>({ok:false,code,executionAllowed:false,migrationAllowed:false,...extra});

// Server-owned migration orchestration. No database/credentials are selected,
// and importing this module performs no network call or database write.
export async function runAgentCostMigration({query,captureBookmark,applyReviewedSql,apply=false,expectedSourceSha256}={}){
  if(typeof apply!=="boolean")return deny("migration_mode_invalid");
  if(apply&&expectedSourceSha256!==manifest.source.sha256)return deny("migration_source_pin_required");
  const before=await inspectAgentCostSchema(query);
  if(!before.ok)return deny(before.code,{inspection:before});
  const plan={migrationPath:manifest.source.path,sourceSha256:manifest.source.sha256,
    migrationRequired:before.code==="accounting_schema_absent",activationChanged:false};
  if(!plan.migrationRequired)return {ok:true,code:"migration_already_applied",...plan,executionAllowed:false,migrationAllowed:false};
  if(!apply)return {ok:true,code:"migration_plan_ready",...plan,executionAllowed:false,migrationAllowed:false};
  if(typeof captureBookmark!=="function"||typeof applyReviewedSql!=="function")return deny("migration_transport_unavailable");
  let bookmark;
  try{bookmark=await captureBookmark()}catch{return deny("migration_bookmark_unavailable")}
  if(typeof bookmark!=="string"||!bookmark.trim()||bookmark.length>400)return deny("migration_bookmark_unavailable");
  // Reinspect after the asynchronous bookmark operation; never overlay old or
  // partially created accounting objects with CREATE IF NOT EXISTS.
  const current=await inspectAgentCostSchema(query);
  if(!current.ok||current.code!=="accounting_schema_absent")return deny("migration_schema_changed",{bookmark,inspection:current});
  let sql;
  try{sql=readFileSync(new URL("../"+manifest.source.path,import.meta.url),"utf8")}catch{return deny("migration_source_unavailable",{bookmark})}
  if(createHash("sha256").update(sql).digest("hex")!==expectedSourceSha256)return deny("migration_source_changed",{bookmark});
  try{await applyReviewedSql({sql,path:manifest.source.path,sourceSha256:expectedSourceSha256,bookmark})}
  catch{return deny("migration_apply_failed",{bookmark,reconciliationRequired:true})}
  const after=await inspectAgentCostSchema(query);
  if(!after.ok||after.code!=="accounting_schema_compatible")return deny("migration_verification_failed",{bookmark,inspection:after,reconciliationRequired:true});
  return {ok:true,code:"migration_applied",...plan,migrationRequired:false,bookmark,
    executionAllowed:false,migrationAllowed:false};
}
