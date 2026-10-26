/** Read-only export retention eligibility audit. Does not delete, write or schedule. */
const valid=v=>typeof v==="string"&&/^[a-zA-Z0-9_.:-]{1,200}$/.test(v);
export function auditExpiredExportJobs(rows,{now=Date.now(),limit=100}={}){
 if(!Array.isArray(rows)||!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(limit)||limit<1||limit>100||rows.length>limit)
  throw new TypeError("invalid_retention_audit");
 let eligible=0,invalid=0,unexpired=0;
 for(const row of rows){
  if(!valid(row?.id)||!valid(row?.tenantId)||!valid(row?.actorId)||
     !Number.isSafeInteger(row?.expiresAt)||row.expiresAt<0||
     row.objectKey!=="ai-exports/"+row.tenantId+"/"+row.id){invalid++;continue}
  if(row.expiresAt>now){unexpired++;continue}
  eligible++;
 }
 return Object.freeze({eligible,invalid,unexpired,inspected:rows.length,readOnly:true});
}
