// Read-only PRIVATE staging metadata qualification. This module never opens a
// database connection, applies SQL, creates tables, or reads customer rows.
const TABLE = "agent_responsibilities";
const SCHEMA = "public";
const EXPECTED = Object.freeze({
  id:["uuid","text","character varying"],
  tenant_id:["uuid","text","character varying"],
  objective:["text","character varying"],
  workspace:["text","character varying"],
  status:["text","character varying"],
  updated_at:["timestamp with time zone","timestamp without time zone"]
});
const fail = (code) => Object.freeze({
  ok:false, code, schemaQualified:false, readOnlyPrivilegeQualified:false,
  readyForStagingDeployment:false, productionActivationAuthorized:false
});
const passed = (code,value) => ({code, passed:value===true});

export async function qualifyWorkspaceAgentPostgresReadOnly({pool,schema=SCHEMA}={}) {
  if (!pool || typeof pool.query!=="function") return fail("readonly_pool_required");
  if (schema!==SCHEMA) return fail("isolated_public_schema_required");
  const table=TABLE;
  let columns, grants, indexes;
  try {
    columns=await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema=$1 AND table_name=$2
      ORDER BY ordinal_position`,[schema,table]);
    grants=await pool.query(`
      SELECT
        has_table_privilege(current_user,to_regclass(format('%I.%I',$1,$2)),'SELECT') AS can_select,
        has_table_privilege(current_user,to_regclass(format('%I.%I',$1,$2)),'INSERT') AS can_insert,
        has_table_privilege(current_user,to_regclass(format('%I.%I',$1,$2)),'UPDATE') AS can_update,
        has_table_privilege(current_user,to_regclass(format('%I.%I',$1,$2)),'DELETE') AS can_delete`,[schema,table]);
    indexes=await pool.query(`
      SELECT indexdef FROM pg_catalog.pg_indexes
      WHERE schemaname=$1 AND tablename=$2`,[schema,table]);
  } catch {
    return fail("readonly_metadata_unavailable");
  }
  if (!Array.isArray(columns?.rows)||!Array.isArray(grants?.rows)||!Array.isArray(indexes?.rows)) {
    return fail("readonly_metadata_invalid");
  }
  const columnMap=new Map(columns.rows.map(row=>[row.column_name,row]));
  const checks=Object.entries(EXPECTED).map(([name,types])=>{
    const row=columnMap.get(name);
    return passed("required_column_"+name,!!row &&
      types.includes(String(row.data_type||"").toLowerCase()) &&
      row.is_nullable==="NO");
  });
  const privilege=grants.rows.length===1?grants.rows[0]:{};
  const restricted=privilege.can_select===true &&
    privilege.can_insert===false && privilege.can_update===false &&
    privilege.can_delete===false;
  checks.push(passed("select_only_staging_identity",restricted));
  const coversQuery=(indexdef)=>{
    const text=String(indexdef||"").toLowerCase();
    const match=text.match(/\(([^)]*)\)/);
    if(!match)return false;
    const columns=match[1].replaceAll('"',"").split(",").map(c=>c.trim().split(/\s+/)[0]);
    return ["tenant_id","workspace","status","updated_at"].every((name,i)=>columns[i]===name);
  };
  checks.push(passed("tenant_workspace_status_updated_index",
    indexes.rows.some(row=>coversQuery(row.indexdef))));
  const schemaQualified=checks.filter(check=>check.code.startsWith("required_column_")||
    check.code==="tenant_workspace_status_updated_index").every(check=>check.passed);
  const readOnlyPrivilegeQualified=checks.find(check=>check.code==="select_only_staging_identity").passed;
  return Object.freeze({
    ok:schemaQualified&&readOnlyPrivilegeQualified,
    code:schemaQualified&&readOnlyPrivilegeQualified?
      "PRIVATE_POSTGRES_READONLY_METADATA_PASS_NOT_DEPLOYABLE":
      "PRIVATE_POSTGRES_READONLY_METADATA_BLOCKED",
    schemaQualified,readOnlyPrivilegeQualified,checks:Object.freeze(checks),
    table, schema, readyForStagingDeployment:false,
    productionActivationAuthorized:false
  });
}
