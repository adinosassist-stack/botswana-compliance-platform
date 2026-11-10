// Pure, bounded, tenant-scoped projection of server-fetched approval audit records.
// Never fetches, mutates or authorizes approvals. Caller must authenticate first.
const validId=x=>typeof x==="string"&&x.length>0&&x.length<=128&&x.trim()===x;
const statuses=new Set(["requested","approved","rejected","expired","consumed"]);
export function projectAgentApprovalHistory({principal,records,limit=20}={}){
 const deny=code=>Object.freeze({ok:false,code,items:Object.freeze([]),readOnly:true});
 if(!principal||principal.authenticated!==true||!validId(principal.tenantId)||!validId(principal.actorId)||!["owner","manager"].includes(principal.actorRole))return deny("unauthenticated");
 if(!Array.isArray(records)||!Number.isInteger(limit)||limit<1||limit>50||records.length>500)return deny("invalid_input");
 const items=[];
 for(const record of records){
  if(!record||typeof record!=="object"||Array.isArray(record))return deny("invalid_record");
  // Never expose cross-tenant rows even if a storage query is misconfigured.
  if(record.tenantId!==principal.tenantId)continue;
  if(!validId(record.id)||!statuses.has(record.status)||typeof record.workflow!=="string"||record.workflow.length>80||typeof record.timestamp!=="string"||!Number.isFinite(Date.parse(record.timestamp)))return deny("invalid_record");
  // Managers may only see records they initiated; owners may see tenant records.
  if(principal.actorRole==="manager"&&record.actorId!==principal.actorId)continue;
  items.push(Object.freeze({id:record.id,workflow:record.workflow,status:record.status,timestamp:record.timestamp}));
  if(items.length===limit)break;
 }
 return Object.freeze({ok:true,items:Object.freeze(items),readOnly:true});
}
