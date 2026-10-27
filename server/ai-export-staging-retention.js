/** Unmounted, staging-only, explicitly confirmed R2 export retention candidate.
 * Default is a read-only dry run. No cron/HTTP route/production binding.
 * Separate approval is required before ANY private R2 delete in isolated staging.
 */
const id=v=>typeof v==="string"&&/^[a-zA-Z0-9_.:-]{1,200}$/.test(v);
const CONFIRM="DELETE_EXPIRED_EXPORT_OBJECTS_IN_STAGING";
const DEFAULT_GRACE_MS=3600000;
const unavailable=reason=>Object.freeze({ok:false,reason,mode:"disabled",inspected:0,eligible:0,deleted:0,failed:0,invalid:0});
const summary=(data)=>Object.freeze(data);
export function createAiExportStagingRetention({
 enabled=false,environment,metadata,exportBinding,evidenceBinding,clock=()=>Date.now(),
 graceMs=DEFAULT_GRACE_MS
}={}){
 if(enabled!==true)return Object.freeze({enabled:false,run:async()=>unavailable("retention_disabled")});
 if(environment!=="isolated-staging"||!metadata||
    typeof metadata.listExpired!=="function"||typeof metadata.find!=="function"||
    !exportBinding||typeof exportBinding.delete!=="function"||
    !evidenceBinding||exportBinding===evidenceBinding||
    typeof clock!=="function"||
    !Number.isSafeInteger(graceMs)||graceMs<DEFAULT_GRACE_MS||graceMs>7*24*3600000)
  throw new TypeError("isolated_retention_dependencies_required");
 return Object.freeze({enabled:true,async run({dryRun=true,approval=false,confirmation="",limit=25}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>25)return unavailable("invalid_retention_limit");
  // An actual delete requires three distinct, literal gates; dry-run cannot delete.
  if(dryRun!==true&&(approval!==true||confirmation!==CONFIRM))
   return unavailable("explicit_staging_delete_approval_required");
  const now=clock();
  if(!Number.isSafeInteger(now)||now<graceMs)return unavailable("invalid_retention_clock");
  const cutoff=now-graceMs;
  let rows;
  try{rows=await metadata.listExpired({before:cutoff,limit})}
  catch{return unavailable("retention_scan_unavailable")}
  if(!Array.isArray(rows)||rows.length>limit)return unavailable("invalid_retention_scan");
  let eligible=0,deleted=0,failed=0,invalid=0;
  for(const row of rows){
   const key="ai-exports/"+row?.tenantId+"/"+row?.id;
   if(!id(row?.tenantId)||!id(row?.actorId)||!id(row?.id)||
      row.status!=="completed"||row.objectKey!==key||
      !Number.isSafeInteger(row.expiresAt)||row.expiresAt>cutoff){
    invalid++;continue;
   }
   // Recheck tenant+actor scope and expiration in durable metadata immediately
   // before any deletion. This still requires an isolated staging credential.
   let current;
   try{current=await metadata.find({id:row.id,tenantId:row.tenantId,actorId:row.actorId})}
   catch{failed++;continue}
   if(current?.id!==row.id||current.tenantId!==row.tenantId||
      current.actorId!==row.actorId||current.objectKey!==key||
      current.status!=="completed"||current.expiresAt!==row.expiresAt||
      current.expiresAt>cutoff){invalid++;continue}
   eligible++;
   if(dryRun===true)continue;
   try{
    // R2.delete is idempotent; never call delete on evidence or foreign keys.
    await exportBinding.delete(key);
    deleted++;
   }catch{failed++}
  }
  return summary({ok:failed===0,reason:failed?"partial_cleanup_failure":"qualified",
   mode:dryRun===true?"read_only":"explicit_isolated_staging_delete",
   inspected:rows.length,eligible,deleted,failed,invalid,graceMs,cutoff});
 }});
}
