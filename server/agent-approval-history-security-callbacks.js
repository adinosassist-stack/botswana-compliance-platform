// Reusable host policy callbacks; never registers or activates a route.
// The host supplies its canonical origin policy and a trusted audit health probe.
export function createAgentHistorySecurityCallbacks({
 requestOriginAllowed,publicOrigin,auditHealth,windowMs=60000,maxRequests=30,now=()=>Date.now()
}={}){
 if(typeof requestOriginAllowed!=="function"||typeof publicOrigin!=="string"||
 !publicOrigin||typeof auditHealth!=="function"||typeof now!=="function"||
 !Number.isInteger(windowMs)||windowMs<1000||!Number.isInteger(maxRequests)||maxRequests<1)
 throw new TypeError("agent_history_security_callbacks_required");
 const hits=new Map();
 return Object.freeze({
  allowedOrigin:async req=>{
   const origin=req?.headers?.origin;
   // Browsers may omit Origin on same-origin GET; enforce Fetch Metadata when present.
   const site=req?.headers?.["sec-fetch-site"];
   if(site&&site!=="same-origin"&&site!=="none")return false;
   if(origin!==undefined&&requestOriginAllowed(origin,publicOrigin)!==true)return false;
   return true;
  },
  rateLimit:async(_req,a)=>{
   if(!a?.tenant_id||!a?.user_id)return false;
   const key=JSON.stringify([a.tenant_id,a.user_id]);
   const time=now();if(!Number.isFinite(time))return false;
   const old=hits.get(key),bucket=old&&time>=old.start&&time-old.start<windowMs?old:{start:time,count:0};
   if(bucket.count>=maxRequests)return false;
   bucket.count++;hits.set(key,bucket);return true;
  },
  auditAvailable:async(req,a)=>(await auditHealth(req,a))===true
 });
}
