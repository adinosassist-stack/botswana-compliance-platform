/**
 * Read-only Cloudflare quotation staging resource inventory.
 *
 * Optional operational diagnostic. Uses only GET to list D1/R2 resource
 * metadata, never creates/migrates/writes/activates a resource or reveals
 * any token. Does NOT assert an environment is approved or deployable.
 *
 * CLI: CLOUDFLARE_API_TOKEN=<read-only-token>
 *      QUOTATION_CF_ACCOUNT_ID=<32-character-account-hex-id>
 *      node scripts/quotation-staging-resource-inventory.mjs
 */
const DB_NAME="bw-quotation-staging";
const LOGO_BUCKET="bw-quotation-logo-private-staging";
const TEMPLATE_BUCKET="bw-quotation-template-private-staging";
const deny=code=>{throw Error(code)};
const isUuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const isHex40=x=>typeof x==="string"&&/^[0-9a-f]{40}$/i.test(x);
const isAccountId=x=>typeof x==="string"&&/^[0-9a-f]{32}$/i.test(x);
const isSafe=x=>typeof x==="string"&&/^[a-z0-9][a-z0-9-]{2,90}$/.test(x);
const safeNameList=items=>Array.isArray(items)&&items.every(x=>isSafe(x?.name));

export function summarizeQuotationStagingInventory({
 databases,buckets,productionD1Id,productionBucketNames=[],exactMainSha
}={}){
 if(!safeNameList(databases)||!safeNameList(buckets)||!isUuid(productionD1Id)||
    !Array.isArray(productionBucketNames)||productionBucketNames.length===0||
    productionBucketNames.some(x=>!isSafe(x))||
    !isHex40(exactMainSha))
  deny("quotation_resource_inventory_invalid");
 const desired=[DB_NAME,LOGO_BUCKET,TEMPLATE_BUCKET];
 const dbs=databases.filter(x=>x.name===DB_NAME);
 const log= buckets.filter(x=>x.name===LOGO_BUCKET);
 const tpl= buckets.filter(x=>x.name===TEMPLATE_BUCKET);
 if(dbs.length>1||log.length>1||tpl.length>1)deny("quotation_resource_inventory_ambiguous");
 const db=dbs[0],bucketLogo=log[0],bucketTemplate=tpl[0];
 const reasons=[];
 if(!db)reasons.push("dedicated_d1_missing");
 if(!bucketLogo)reasons.push("private_logo_bucket_missing");
 if(!bucketTemplate)reasons.push("private_template_bucket_missing");
 if(db&&(!isUuid(db.uuid)||db.uuid===productionD1Id))
  reasons.push("d1_identity_invalid_or_production");
 if(productionBucketNames.includes(LOGO_BUCKET)||productionBucketNames.includes(TEMPLATE_BUCKET))
  reasons.push("private_bucket_name_conflicts_with_production");
 // An R2 bucket's existence does NOT prove it has no custom domain or public dev URL.
 // This diagnostic deliberately never asserts that buckets are private.
 return Object.freeze({
  mode:"read_only",exactMainSha,
  targetNames:Object.freeze({d1:DB_NAME,logoBucket:LOGO_BUCKET,templateBucket:TEMPLATE_BUCKET}),
  presence:Object.freeze({d1:!!db,logoBucket:!!bucketLogo,templateBucket:!!bucketTemplate}),
  stagingD1Id:db&&isUuid(db.uuid)?db.uuid:null,
  missingOrUnsafe:Object.freeze(reasons),
  resourceIdentityCheckPassed:reasons.length===0,
  privateRoutesVerified:false,
  productionIsolationFullyVerified:false,
  templateApproved:false,
  migrationAuthorized:false,
  deploymentAuthorized:false,
  independentReviewerRequired:"thusico",
  nextAction:reasons.length?"obtain_independent_provisioning_approval":"verify_private_access_and_schema_separately"
 });
}

export async function inspectQuotationCloudflareResources({
 fetchImpl,apiToken,accountId,productionD1Id,productionBucketNames,exactMainSha
}={}){
 if(typeof fetchImpl!=="function"||typeof apiToken!=="string"||apiToken.length<10||
    !isAccountId(accountId)||!isUuid(productionD1Id)||!isHex40(exactMainSha))
  deny("quotation_inventory_client_unconfigured");
 const root="https://api.cloudflare.com/client/v4/accounts/"+accountId;
 const fetchJSON=async(url)=>{
  const u=new URL(url);
  if(u.protocol!=="https:"||u.hostname!=="api.cloudflare.com"||
     !u.pathname.startsWith("/client/v4/accounts/"+accountId+"/"))
   deny("quotation_inventory_bad_endpoint");
  const response=await fetchImpl(u.toString(),{method:"GET",headers:{
   authorization:"Bearer "+apiToken,accept:"application/json"
  },redirect:"error",cache:"no-store"});
  if(!response?.ok)deny("quotation_inventory_upstream_unavailable");
  const contentLength=response.headers?.get?.("content-length");
  if(contentLength!==null&&contentLength!==undefined&&
     Number(contentLength)>1_000_000)deny("quotation_inventory_response_too_large");
  // The metadata lists are small. Require bounded network responses even if
  // Content-Length was omitted.
  let payload="";
  if(response.body?.getReader){
   const reader=response.body.getReader();const decoder=new TextDecoder();
   try{for(;;){
    const {value,done}=await reader.read();if(done)break;
    if(!(value instanceof Uint8Array))deny("quotation_inventory_bad_response");
    payload+=decoder.decode(value,{stream:true});
    if(payload.length>1_000_000)deny("quotation_inventory_response_too_large");
   }
   payload+=decoder.decode();
   }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
  }else{
   payload=await response.text();
   if(payload.length>1_000_000)deny("quotation_inventory_response_too_large");
  }
  let json;
  try{json=JSON.parse(payload)}catch{deny("quotation_inventory_bad_response")}
  if(json?.success!==true||!json.result)deny("quotation_inventory_upstream_unavailable");
  return json;
 };
 const db=[];let page=1;
 for(;page<=10;page++){
  const json=await fetchJSON(root+"/d1/database?page="+page+"&per_page=100");
  if(!Array.isArray(json.result))deny("quotation_inventory_bad_response");
  db.push(...json.result.map(x=>({name:x.name,uuid:x.uuid})));
  const info=json.result_info;
  if(!info||!Number.isSafeInteger(info.total_pages)||info.total_pages<1)
   deny("quotation_inventory_pagination_unverified");
  if(page>=info.total_pages)break;
 }
 if(page>10)deny("quotation_inventory_pagination_limit");
 const buckets=[];const visited=new Set();
 let cursor="";
 for(let i=0;i<10;i++){
  const path=root+"/r2/buckets?per_page=100"+
   (cursor?"&cursor="+encodeURIComponent(cursor):"");
  const json=await fetchJSON(path);
  const rows=Array.isArray(json.result)?json.result:json.result?.buckets;
  if(!Array.isArray(rows))deny("quotation_inventory_bad_response");
  buckets.push(...rows.map(x=>({name:x.name})));
  const next=json.result?.cursor||json.result_info?.cursor;
  if(next===undefined||next===null||next==="")break;
  if(typeof next!=="string"||next.length>512||visited.has(next))
   deny("quotation_inventory_pagination_unverified");
  visited.add(next);cursor=next;
  if(i===9)deny("quotation_inventory_pagination_limit");
 }
 return summarizeQuotationStagingInventory({
  databases:db,buckets,productionD1Id,productionBucketNames,exactMainSha
 });
}

if(process.argv[1]&&import.meta.url.endsWith("/"+process.argv[1].split("/").at(-1))){
 const env=process.env;
 inspectQuotationCloudflareResources({
  fetchImpl:fetch,apiToken:env.CLOUDFLARE_API_TOKEN,
  accountId:env.QUOTATION_CF_ACCOUNT_ID,
  productionD1Id:env.QUOTATION_PRODUCTION_D1_ID,
  productionBucketNames:String(env.QUOTATION_PRODUCTION_R2_NAMES||"").split(",").filter(Boolean),
  exactMainSha:env.QUOTATION_EXACT_MAIN_SHA
 }).then(result=>{
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  process.exitCode=result.resourceIdentityCheckPassed?0:2;
 }).catch(error=>{
  process.stderr.write(JSON.stringify({ok:false,code:error?.message||"quotation_inventory_failed"})+"\n");
  process.exitCode=2;
 });
}
