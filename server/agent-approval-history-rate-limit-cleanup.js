// Explicit, opt-in cleanup for the shared Agent history rate-limit table.
// The caller must schedule this in an approved private maintenance job.
export function createAgentHistoryRateLimitCleanup({pool,windowSeconds=60,retentionSeconds=86400,clock=()=>new Date()}={}){
 if(!pool||typeof pool.query!=="function"||!Number.isInteger(windowSeconds)||windowSeconds<1||
 !Number.isInteger(retentionSeconds)||retentionSeconds<windowSeconds*2||
 typeof clock!=="function")throw new TypeError("agent_history_cleanup_dependencies_required");
 return async function cleanup(){
  const time=clock();
  if(!(time instanceof Date)||!Number.isFinite(time.getTime()))throw new TypeError("agent_history_cleanup_invalid_clock");
  const cutoff=Math.floor((time.getTime()-retentionSeconds*1000)/(windowSeconds*1000));
  const result=await pool.query("delete from agent_history_rate_limits where bucket_id<$1",[cutoff]);
  return Number(result?.rowCount||0);
 };
}
