/** Framework-neutral read-only Assets HTTP handler.
 * Host must inject trusted session auth, CSRF/origin middleware (for mutations),
 * strict route rate limits and an authorized summary reader. Never trusts tenant IDs in requests.
 */
export function createAssetsSummaryHttp({authenticate,readSummary,rateLimit}={}){
 if([authenticate,readSummary,rateLimit].some(f=>typeof f!=="function"))throw new TypeError("assets_http_dependencies_required");
 const reply=(status,body)=>({status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"},body});
 return async function assetsSummaryHttp(req){
  if(req?.method!=="GET")return reply(405,{error:"method_not_allowed"});
  let principal;
  try{principal=await authenticate(req)}catch{return reply(401,{error:"unauthorized"})}
  if(!principal?.companyId||!principal?.userId)return reply(401,{error:"unauthorized"});
  let allowed=false;
  try{allowed=await rateLimit(principal,"assets:summary")}catch{return reply(503,{error:"rate_limit_unavailable"})}
  if(allowed!==true)return reply(429,{error:"rate_limited"});
  try{
   const data=await readSummary(principal);
   return reply(200,{data});
  }catch(error){
   if(error?.message==="forbidden"||error?.message==="unauthorized")return reply(403,{error:"forbidden"});
   return reply(503,{error:"assets_unavailable"});
  }
 };
}
