/**
 * Read-only quotation draft schema qualification, additive to the existing
 * private logo/template staging preflight. Never migrates or activates D1.
 *
 * Expected SQL is pinned to docs/sql/quotation-drafts-staging-candidate.sql.
 * Changes to that SQL must be reviewed with an updated static contract and
 * a new, independent authorization before any migration execution.
 */
import {qualifyQuotationPrivateStaging} from "./quotation-staging-readonly-preflight.mjs";

export const quotationDraftExpectedSchema=Object.freeze({
 table:`CREATE TABLE quotation_drafts (
 tenant_id TEXT NOT NULL CHECK(
   length(tenant_id) BETWEEN 1 AND 100
   AND tenant_id NOT GLOB '*[^A-Za-z0-9_-]*'
 ),
 id TEXT NOT NULL CHECK(
   length(id) BETWEEN 1 AND 100 AND id NOT GLOB '*[^A-Za-z0-9_-]*'
 ),
 revision INTEGER NOT NULL CHECK(
   typeof(revision)='integer' AND revision BETWEEN 1 AND 2147483647
 ),
 draft_json TEXT NOT NULL CHECK(
   length(draft_json) BETWEEN 2 AND 32768
   AND json_valid(draft_json)
 ),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,id)
)`,
 index:`CREATE INDEX idx_quotation_drafts_tenant_updated
 ON quotation_drafts (tenant_id,updated_at)`
});

export function canonicalQuotationSchemaSql(value){
 if(typeof value!=="string")return null;
 return value.trim().replace(/;\s*$/,"").replace(/\s+/g," ").toLowerCase();
}

const expectedObjects=Object.freeze([
 "quotation_logo_assets","quotation_logo_settings","quotation_drafts",
 "idx_quotation_drafts_tenant_updated"
]);
const userSchemaSql="SELECT name,type,sql FROM sqlite_master WHERE "+
 "((type='table' AND name NOT LIKE 'sqlite_%') "+
 "OR (type='index' AND sql IS NOT NULL))";

/**
 * Caller supplies exact-main source identity, isolated D1/R2 read-only
 * bindings, and verified no-public-route flags, as for the logo preflight.
 *
 * A positive result is only evidence for seeking separate owner/reviewer
 * qualification approval. It is NEVER permission to migrate, upload a
 * customer template, bind a Worker, deploy or issue a quotation.
 */
export async function qualifyQuotationDraftPrivateStaging(config={}){
 const base=await qualifyQuotationPrivateStaging(config);
 const db=config.d1;
 let rows;
 try{
  const result=await db.prepare(userSchemaSql).all();
  rows=result?.results;
 }catch{throw Error("quotation_draft_staging_schema_read_failed")}
 if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.name!=="string"||
    !["table","index"].includes(row.type)))
  throw Error("quotation_draft_staging_schema_read_failed");
 const collisions=new Set(),seen=new Set(),unexpectedObjects=[];
 for(const row of rows){
  const id=row.type+":"+row.name;
  if(seen.has(id))collisions.add(row.name);
  seen.add(id);
  if(!expectedObjects.includes(row.name)||
     (row.name==="idx_quotation_drafts_tenant_updated"&&row.type!=="index")||
     (row.name!=="idx_quotation_drafts_tenant_updated"&&row.type!=="table"))
   unexpectedObjects.push(row.name);
 }
 unexpectedObjects.push(...collisions);
 const byName=name=>rows.filter(row=>row.name===name);
 const foundTable=byName("quotation_drafts")[0];
 const foundIndex=byName("idx_quotation_drafts_tenant_updated")[0];
 const missingTables=[...base.missingTables];
 if(!foundTable)missingTables.push("quotation_drafts");
 const missingIndexes=foundIndex?[]:["idx_quotation_drafts_tenant_updated"];
 const mismatchedObjects=[];
 if(foundTable?.type==="table"&&canonicalQuotationSchemaSql(foundTable.sql)!==
    canonicalQuotationSchemaSql(quotationDraftExpectedSchema.table))
  mismatchedObjects.push("quotation_drafts");
 if(foundIndex?.type==="index"&&canonicalQuotationSchemaSql(foundIndex.sql)!==
    canonicalQuotationSchemaSql(quotationDraftExpectedSchema.index))
  mismatchedObjects.push("idx_quotation_drafts_tenant_updated");
 // An index with the right name but an unexpected type is not valid readiness.
 const schemaReady=missingTables.length===0&&missingIndexes.length===0&&
  mismatchedObjects.length===0&&unexpectedObjects.length===0;
 return Object.freeze({
  qualification:"read_only",
  environment:base.environment,sourceSha:base.sourceSha,
  checked:Object.freeze([...base.checked,"d1_draft_schema_read"]),
  missingTables:Object.freeze(missingTables),
  missingIndexes:Object.freeze(missingIndexes),
  mismatchedObjects:Object.freeze(mismatchedObjects),
  unexpectedObjects:Object.freeze(unexpectedObjects),
  logoSchemaDeepVerified:false,
  draftSchemaExactlyMatched:foundTable?.type==="table"&&
    foundIndex?.type==="index"&&mismatchedObjects.length===0,
  schemaReady,
  readyForSeparateQualificationApproval:schemaReady,
  deploymentAuthorized:false,
  migrationAuthorized:false,
  templateUploadAuthorized:false,
  privateWorkerBindingAuthorized:false,
  independentReviewerRequired:"thusico",
  humanTemplateApprovalRequired:true
 });
}
