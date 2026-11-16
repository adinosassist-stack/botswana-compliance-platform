// Host adapter for the existing server.js authenticated session boundary.
// Never registers a route. Requires an authenticated, database-backed req.auth
// from loadSessionAuth and an independently supplied origin policy.
export function createAgentHistoryHostGuards({pool,allowedOrigin,rateLimit,auditAvailable}={}){
 if(!pool||typeof pool.query!=="function"||
  typeof allowedOrigin!=="function"||typeof rateLimit!=="function"||
  typeof auditAvailable!=="function")
  throw new TypeError("agent_history_host_guards_required");
 return Object.freeze({
  tenantMembership:async(_req,a)=>{
   if(!a?.id||!a?.tenant_id||!a?.user_id)return false;
   const result=await pool.query(
    "select 1 from sessions s join memberships m on m.user_id=s.user_id and m.tenant_id=s.tenant_id and m.status='active' join users u on u.id=s.user_id where s.id=$1 and s.user_id=$2 and s.tenant_id=$3 and s.revoked_at is null and s.expires_at>now() and s.session_generation=u.session_generation limit 1",
    [a.id,a.user_id,a.tenant_id]);
   return result?.rows?.length===1;
  },
  originCheck:async req=>(await allowedOrigin(req))===true,
  rateLimit:async(req,a)=>(await rateLimit(req,a))===true,
  auditAvailable:async(req,a)=>(await auditAvailable(req,a))===true,
  getDatabase:()=>pool
 });
}
