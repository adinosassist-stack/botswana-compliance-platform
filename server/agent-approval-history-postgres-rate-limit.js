// Shared PostgreSQL rate limiter for a private, opt-in Agent history endpoint.
// Requires a separately approved migration. No schema changes or routes here.
export function createAgentHistoryPostgresRateLimiter({pool,limit=30,windowSeconds=60,clock=()=>new Date()}={}){
 if(!pool||typeof pool.query!=="function"||!Number.isInteger(limit)||limit<1||
 !Number.isInteger(windowSeconds)||windowSeconds<1||typeof clock!=="function")
 throw new TypeError("agent_history_postgres_rate_limiter_dependencies_required");
 return async function distributedRateLimit({tenantId,actorId}={}){
  if(typeof tenantId!=="string"||!tenantId||typeof actorId!=="string"||!actorId)return false;
  try{
   const time=clock();
   if(!(time instanceof Date)||!Number.isFinite(time.getTime()))return false;
   const bucket=Math.floor(time.getTime()/(windowSeconds*1000));
   const result=await pool.query(
    "insert into agent_history_rate_limits (tenant_id,actor_id,bucket_id,request_count) values ($1,$2,$3,1) on conflict (tenant_id,actor_id,bucket_id) do update set request_count=agent_history_rate_limits.request_count+1 where agent_history_rate_limits.request_count<$4 returning request_count",
    [tenantId,actorId,bucket,limit]);
   return result?.rows?.length===1&&Number(result.rows[0].request_count)<=limit;
  }catch{return false}
 };
}
