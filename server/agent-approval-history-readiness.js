// Optional readiness probes for a private Agent approval-history endpoint.
// These checks do not mount routes or grant access. No audit writes are made.
export function createAgentHistoryReadiness({pool,distributedRateLimit}={}){
 if(!pool||typeof pool.query!=="function"||typeof distributedRateLimit!=="function")
  throw new TypeError("agent_history_readiness_dependencies_required");
 return Object.freeze({
  auditHealth:async(_req,a)=>{
   if(!a?.tenant_id||!a?.user_id)return false;
   try{
    const r=await pool.query("select to_regclass('public.audit_events') as audit_table");
    return r?.rows?.length===1&&r.rows[0].audit_table!==null&&
     r.rows[0].audit_table!==undefined;
   }catch{return false}
  },
  rateLimit:async(req,a)=>{
   if(!a?.tenant_id||!a?.user_id)return false;
   try{return (await distributedRateLimit({tenantId:a.tenant_id,actorId:a.user_id,request:req}))===true}
   catch{return false}
  }
 });
}
