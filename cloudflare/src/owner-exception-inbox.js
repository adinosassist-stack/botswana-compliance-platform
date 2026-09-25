export const OWNER_EXCEPTION_INBOX_VERSION="2026-09-25.v1";
const rank=Object.freeze({high:3,medium:2,low:1});
export function prepareOwnerExceptions({taskId,exceptions=[]}={}){
 return Object.freeze((Array.isArray(exceptions)?exceptions:[]).map((x,i)=>Object.freeze({
  id:`${String(taskId||"task")}:${String(x.key||i)}`,taskId:String(taskId||""),type:String(x.key||"unknown"),
  severity:["high","medium","low"].includes(x.severity)?x.severity:"medium",count:Number(x.count||0),exposureMinor:Number(x.exposureMinor||0),
  status:"needs_owner_attention",delivery:"command_centre_only",externalMessageAllowed:false,executionAllowed:false
 })).sort((a,b)=>rank[b.severity]-rank[a.severity]));
}