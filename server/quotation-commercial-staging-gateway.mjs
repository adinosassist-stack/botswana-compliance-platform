/** Source-only, default-off Access gateway; no routes are created by importing. */
const denied=()=>new Response('Not Found',{status:404,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const decode=value=>{if(typeof value!=='string'||value.length>16384||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('invalid_jwt');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))};
const parse=value=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(value)));
export function createQuotationCommercialStagingGateway({env,fetchImpl=fetch,now=()=>Date.now()}={}){
 if(env?.APP_ENV!=='quotation-private-staging'||env.QUOTATION_COMMERCIAL_GATEWAY_ENABLED!=='true')throw Error('gateway_disabled');
 let origin,issuer;
 try{
  const u=new URL(env.QUOTATION_COMMERCIAL_PRIVATE_ORIGIN),i=new URL(env.QUOTATION_ACCESS_TEAM_ORIGIN);
  if(u.protocol!=='https:'||u.hostname==='www.thebedesk.com'||!u.hostname.endsWith('.thebedesk.com')||u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash||i.protocol!=='https:'||!/^[-a-z0-9]+\.cloudflareaccess\.com$/.test(i.hostname)||i.port||i.username||i.password||i.pathname!=='/'||i.search||i.hash)throw Error();
  origin=u.origin;issuer=i.origin;
 }catch{throw Error('gateway_origin_required')}
 const audience=env.QUOTATION_ACCESS_AUD;
 if(typeof audience!=='string'||!audience||audience.length>256||typeof env.COMMERCIAL?.fetch!=='function'||typeof fetchImpl!=='function')throw Error('gateway_unconfigured');
 let keys=[],loaded=0;
 async function getKey(kid){
  let key=keys.find(k=>k.kid===kid);
  if(!key||now()-loaded>300000){
   // workerd rejects redirect:'error' before issuing the request. Manual mode
   // preserves the pinned certificate origin: every redirect remains non-ok.
   const res=await fetchImpl(issuer+'/cdn-cgi/access/certs',{redirect:'manual',cache:'no-store'});
   if(!res.ok)throw Error('keys_unavailable');
   const reader=res.body?.getReader();if(!reader)throw Error('keys_unavailable');
   const chunks=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('keys_too_large');chunks.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!Array.isArray(data.keys)||data.keys.length>20)throw Error('invalid_keys');
   keys=data.keys;loaded=now();key=keys.find(k=>k.kid===kid);
  }
  if(!key||key.kty!=='RSA'||(key.alg&&key.alg!=='RS256')||(key.use&&key.use!=='sig')||key.d)throw Error('key_denied');
  return crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 }
 return {async fetch(request){
  try{
   if(new URL(request.url).origin!==origin)return denied();
   const token=request.headers.get('cf-access-jwt-assertion');
   if(typeof token!=='string'||token.length>16384)return denied();
   const parts=token.split('.');if(parts.length!==3)return denied();
   const head=parse(parts[0]),claims=parse(parts[1]),seconds=Math.floor(now()/1000);
   if(head.alg!=='RS256'||typeof head.kid!=='string'||!head.kid||head.kid.length>200||head.jku||head.jwk||head.x5u||head.crit)return denied();
   if(claims.iss!==issuer||!(typeof claims.aud==='string'?claims.aud===audience:Array.isArray(claims.aud)&&claims.aud.includes(audience))||!Number.isSafeInteger(claims.exp)||claims.exp<=seconds||(claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>seconds))||(claims.iat!==undefined&&(!Number.isSafeInteger(claims.iat)||claims.iat>seconds)))return denied();
   const key=await getKey(head.kid);
   if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return denied();
   // The application independently checks its synthetic HMAC cookie/session.
   return await env.COMMERCIAL.fetch(request);
  }catch{return denied()}
 }};
}
