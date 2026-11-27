/**
 * Source-only PRIVATE quotation authentication adapter.
 * Importing this module does not activate, deploy, or register a route.
 * Only a protected staging host may inject an independently approved
 * authentication D1 binding and the correct session-HMAC secret.
 * Never copy production sessions, cookies, or secrets into staging fixtures.
 *
 * Dedicated quotation D1 holds drafts and logos, NOT identity tables.
 */
const deny=code=>{throw Error(code)};
const uuid=value=>typeof value==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const names=new Set(["__Host-bw_session","bw_session"]);
const sessionSql="SELECT s.user_id,s.tenant_id,m.role,s.csrf_token,s.expires_at "+
 "FROM sessions s JOIN users u ON u.id=s.user_id "+
 "JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id AND m.status='active' "+
 "WHERE s.token_hash=? AND s.tenant_id=? "+
 "AND s.session_generation=u.session_generation AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1";
const membershipSql="SELECT m.user_id,m.tenant_id,m.role "+
 "FROM memberships m JOIN users u ON u.id=m.user_id "+
 "WHERE m.tenant_id=? AND m.user_id=? AND m.status='active' LIMIT 1";
// Rekey an operator-created short-lived session exactly once. The admission
// ticket is never the resulting browser cookie, and expiry is never extended.
const admissionSql="UPDATE sessions SET token_hash=? WHERE token_hash=? AND tenant_id=? "+
 "AND expires_at>CURRENT_TIMESTAMP AND expires_at<=datetime('now','+15 minutes') "+
 "AND EXISTS(SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id "+
 "AND m.tenant_id=sessions.tenant_id WHERE u.id=sessions.user_id "+
 "AND u.session_generation=sessions.session_generation AND m.status='active' AND m.role='owner') "+
 "RETURNING expires_at";
const validId=x=>typeof x==="string"&&x.length>0&&x.length<=128;
function sessionCookie(request){
 if(!(request instanceof Request))return null;
 const header=request.headers.get("cookie")||"";
 if(header.length>4096)return null;
 let value=null;
 for(const segment of header.split(";")){
  const pos=segment.indexOf("=");
  if(pos<0)continue;
  const name=segment.slice(0,pos).trim();
  if(!names.has(name))continue;
  if(value!==null)return null; // Never select between conflicting cookies.
  try{value=decodeURIComponent(segment.slice(pos+1).trim())}
  catch{return null}
 }
 // Pending admission tickets are not browser sessions, even before exchange.
 return typeof value==="string"&&!value.startsWith('quotation-test-')&&value.length>=16&&value.length<=512?value:null;
}
async function sessionHmac(secret,cookie){
 const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signed=await crypto.subtle.sign("HMAC",key,encoder.encode(cookie));
 return [...new Uint8Array(signed)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
function sameToken(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length<16||
    a.length!==b.length||a.length>256)return false;
 let difference=0;
 for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 return difference===0;
}
/** Separate real host binding, recovery, Access, and route approvals required. */
export function createQuotationPrivateD1SessionVerifier({
 enabled=false,environment,authDb,sessionSecret,expectedTenantId
}={}){
 if(enabled!==true||environment!=="quotation-private-staging")
  deny("quotation_private_auth_disabled");
 if(!uuid(expectedTenantId)||typeof authDb?.prepare!=="function"||
    typeof sessionSecret!=="string"||sessionSecret.length<32)
  deny("quotation_private_auth_unconfigured");
 async function readRow(request){
  const cookie=sessionCookie(request);
  if(!cookie)return null;
  try{
   const hash=await sessionHmac(sessionSecret,cookie);
   const row=await authDb.prepare(sessionSql).bind(hash,expectedTenantId).first();
   if(!row||row.tenant_id!==expectedTenantId||!validId(row.user_id)||
      !["owner","admin","manager","staff"].includes(String(row.role).toLowerCase()))
    return null;
   return row;
  }catch{return null}
 }
 return Object.freeze({
  async exchangeSyntheticAdmission({ticket}={}){
   if(typeof ticket!=='string'||!/^quotation-test-[A-Za-z0-9_-]{43}$/.test(ticket))return null;
   try{
    const cookie=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    const oldHash=await sessionHmac(sessionSecret,ticket),newHash=await sessionHmac(sessionSecret,cookie);
    const row=await authDb.prepare(admissionSql).bind(newHash,oldHash,expectedTenantId).first();
    const expiresAt=Date.parse(String(row?.expires_at).replace(' ','T')+'Z');
    if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+15*60*1000)return null;
    return Object.freeze({cookie,expiresAt});
   }catch{return null}
  },
  // For the separately qualified private browser host only. Never return this
  // object to an unverified request; the host must still enforce owner scope.
  async readVerifiedBrowserSession({request}={}){
   const row=await readRow(request);
   if(!row)return null;
   const expiresAt=Date.parse(String(row.expires_at).replace(" ","T")+"Z");
   if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+15*60*1000)return null;
   return Object.freeze({authenticated:true,userId:row.user_id,
    tenantId:expectedTenantId,role:String(row.role).toLowerCase(),csrfToken:row.csrf_token});
  },
  async readVerifiedSession({request}={}){
   const row=await readRow(request);
   if(!row)return null;
   return Object.freeze({authenticated:true,userId:row.user_id,
    tenantId:expectedTenantId,role:String(row.role).toLowerCase()});
  },
  async verifyActiveMembership({actor,tenantId,userId}={}){
   if(tenantId!==expectedTenantId||!validId(userId)||
      actor?.tenantId!==expectedTenantId||actor?.userId!==userId)return null;
   try{
    const row=await authDb.prepare(membershipSql).bind(expectedTenantId,userId).first();
    if(!row||row.tenant_id!==expectedTenantId||row.user_id!==userId||
       String(row.role).toLowerCase()!==actor.role)return null;
    return Object.freeze({active:true,tenantId:expectedTenantId,userId,role:actor.role});
   }catch{return null}
  },
  async verifyMutation({request,actor,companyId}={}){
   if(companyId!==expectedTenantId||actor?.tenantId!==expectedTenantId||
      !validId(actor.userId))return false;
   const row=await readRow(request);
   if(!row||row.user_id!==actor.userId||
      String(row.role).toLowerCase()!==actor.role)return false;
   return sameToken(row.csrf_token,request.headers.get("x-csrf-token"));
  }
 });
}
