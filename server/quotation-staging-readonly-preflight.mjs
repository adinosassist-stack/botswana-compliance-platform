/**
 * Read-only qualification for FUTURE dedicated quotation staging resources.
 *
 * This module does not provision Cloudflare resources, create tables, write to
 * R2, mount routes, deploy Workers, or approve a production promotion.
 *
 * Caller must supply identity/permission-proven bindings and independently
 * verify that supplied IDs correspond to dedicated staging resources.
 * "qualifies" means only these read-only prerequisites passed; never an
 * approval to deploy or expose traffic.
 */
const err=code=>{throw Error(code)};
const hex40=x=>typeof x==="string"&&/^[0-9a-f]{40}$/i.test(x);
const validName=x=>typeof x==="string"&&/^[a-z0-9][a-z0-9-]{2,90}$/.test(x);
const requiredTables=Object.freeze(["quotation_logo_assets","quotation_logo_settings"]);

export async function qualifyQuotationPrivateStaging({
 environment,sourceSha,expectedSourceSha,
 d1,d1Id,productionD1Id,
 privateLogoBucket,logoBucketName,
 privateTemplateBucket,templateBucketName,
 productionBucketNames=[],
 routes=[],workersDevEnabled=false,previewUrlsEnabled=false
}={}){
 // Do not silently degrade from a private qualification into a live service.
 if(environment!=="quotation-private-staging"||
    !hex40(sourceSha)||!hex40(expectedSourceSha)||
    sourceSha.toLowerCase()!==expectedSourceSha.toLowerCase())
  err("quotation_staging_exact_source_required");
 if(!hex40(d1Id)||!hex40(productionD1Id)||d1Id===productionD1Id)
  err("quotation_staging_d1_must_be_distinct");
 if(!validName(logoBucketName)||!validName(templateBucketName)||
    logoBucketName===templateBucketName||
    productionBucketNames.includes(logoBucketName)||
    productionBucketNames.includes(templateBucketName))
  err("quotation_staging_private_buckets_must_be_distinct");
 if(!Array.isArray(routes)||routes.length!==0||
    workersDevEnabled!==false||previewUrlsEnabled!==false)
  err("quotation_staging_public_exposure_prohibited");
 if(typeof d1?.prepare!=="function"||
    typeof privateLogoBucket?.list!=="function"||
    typeof privateTemplateBucket?.list!=="function")
  err("quotation_staging_read_only_bindings_required");
 const queries=[];
 // Use only SELECT; this can qualify the candidate schema without migrating it.
 const sql="SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?)";
 let rows;
 try{
  queries.push("d1_schema_read");
  const result=await d1.prepare(sql).bind(...requiredTables).all();
  rows=result?.results;
 }catch{err("quotation_staging_schema_read_failed")}
 if(!Array.isArray(rows))err("quotation_staging_schema_read_failed");
 const existing=new Set(rows.map(row=>row?.name).filter(name=>typeof name==="string"));
 const missingTables=requiredTables.filter(name=>!existing.has(name));
 try{
  queries.push("private_logo_bucket_list");
  await privateLogoBucket.list({limit:1,prefix:"quotation-logos/"});
  queries.push("private_template_bucket_list");
  await privateTemplateBucket.list({limit:1,prefix:"quotation-templates/"});
 }catch{err("quotation_staging_private_storage_read_failed")}
 return Object.freeze({
  qualification:"read_only",environment,sourceSha,
  isolatedBindingsChecked:true,publicRoutes:false,
  schemaReady:missingTables.length===0,
  missingTables:Object.freeze(missingTables),
  checked:Object.freeze(queries),
  readyForSeparateApproval:missingTables.length===0,
  deploymentAuthorized:false,
  independentReviewerRequired:"thusico",
  humanTemplateApprovalRequired:true
 });
}
