import {__v782150Test} from "./worker.js";

const PLATFORM_OWNER_EMAIL="thebedesk@gmail.com";
const PLATFORM_OWNER_FALLBACK_TENANT_ID="tenant_thebedesk_platform_owner";
const PLATFORM_OWNER_FALLBACK_TENANT_NAME="Thebe Desk";
const PLATFORM_OWNER_AI_ALLOWANCE=10000;
const PLATFORM_OWNER_OVERRIDE_REASON="platform_owner_internal_full_access";

function logicalRequestPath(request){
  try{
    const url=new URL(request.url);
    if(url.pathname==="/"){
      const tunneled=url.searchParams.get("__thebe_api_path");
      if(tunneled)return String(tunneled);
    }
    if(url.pathname.startsWith("/__thebe_api/"))return `/api/${url.pathname.slice("/__thebe_api/".length)}`;
    if(url.pathname==="/__thebe_api")return "/api";
    return url.pathname;
  }catch{return ""}
}

function ownerLoginOriginAllowed(request,env){
  const origin=String(request?.headers?.get?.("origin")||"").trim();
  if(!origin)return true;
  try{
    const configured=new URL(String(env?.PUBLIC_ORIGIN||env?.PUBLIC_APP_URL||""));
    return new URL(origin).origin===configured.origin;
  }catch{return false}
}

function constantTimeEqual(left,right){
  if(!(left instanceof Uint8Array)||!(right instanceof Uint8Array)||left.length!==right.length)return false;
  let diff=0;
  for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
  return diff===0;
}

async function verifyStoredPassword(password,stored){
  const parsed=__v782150Test.parsePasswordHash(stored);
  if(!parsed)return false;
  try{
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(password||"")),"PBKDF2",false,["deriveBits"]);
    const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:parsed.salt,iterations:parsed.iterations},key,parsed.digest.length*8);
    return constantTimeEqual(new Uint8Array(bits),parsed.digest);
  }catch{return false}
}

async function canonicalOwnerMembership(env,userId){
  return env.DB.prepare(`SELECT m.tenant_id,m.role,m.status,t.created_at
    FROM memberships m JOIN tenants t ON t.id=m.tenant_id
    WHERE m.user_id=?
    ORDER BY CASE WHEN m.role='owner' AND m.status='active' THEN 0 ELSE 1 END,t.created_at ASC,m.tenant_id ASC
    LIMIT 1`).bind(userId).first();
}

async function selectedOwnerMembership(env,userId,tenantId){
  const requested=String(tenantId||"").trim();
  if(!requested)return null;
  return env.DB.prepare(`SELECT m.tenant_id,m.role,m.status,t.created_at
    FROM memberships m JOIN tenants t ON t.id=m.tenant_id
    WHERE m.user_id=? AND m.tenant_id=? AND m.role='owner' AND m.status='active'
    LIMIT 1`).bind(userId,requested).first();
}

async function ensurePlatformOwnerAccess(env,userId,preferredTenantId=""){
  const requested=String(preferredTenantId||"").trim();
  const membership=requested
    ?await selectedOwnerMembership(env,userId,requested)
    :await canonicalOwnerMembership(env,userId);
  if(requested&&!membership)return null;
  let tenantId=String(membership?.tenant_id||"");
  let repaired=false;
  if(!tenantId){
    tenantId=PLATFORM_OWNER_FALLBACK_TENANT_ID;
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO tenants(id,name,created_at) VALUES(?,?,CURRENT_TIMESTAMP)").bind(tenantId,PLATFORM_OWNER_FALLBACK_TENANT_NAME),
      env.DB.prepare("INSERT OR IGNORE INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").bind(tenantId,userId)
    ]);
    repaired=true;
  }else if(membership.role!=="owner"||membership.status!=="active"){
    await env.DB.prepare("UPDATE memberships SET role='owner',status='active' WHERE tenant_id=? AND user_id=?").bind(tenantId,userId).run();
    repaired=true;
  }

  const sentinel=await env.DB.prepare("SELECT enabled,limit_value FROM entitlement_overrides WHERE tenant_id=? AND feature_key='core_compliance' AND reason=? LIMIT 1")
    .bind(tenantId,PLATFORM_OWNER_OVERRIDE_REASON).first();
  const wallet=await env.DB.prepare("SELECT balance,monthly_allowance FROM ai_credit_wallets WHERE tenant_id=? LIMIT 1").bind(tenantId).first();
  const principal=await env.DB.prepare("SELECT role,active,email FROM platform_regulatory_principals WHERE user_id=? LIMIT 1").bind(userId).first();
  const accessReady=Number(sentinel?.enabled)===1&&Number(sentinel?.limit_value)>=2147483647&&Number(wallet?.monthly_allowance)>=PLATFORM_OWNER_AI_ALLOWANCE;
  const principalReady=principal?.role==="admin"&&Number(principal?.active)===1&&String(principal?.email||"").toLowerCase()===PLATFORM_OWNER_EMAIL;

  if(!accessReady||!principalReady){
    const statements=[];
    if(!accessReady){
      statements.push(
        env.DB.prepare("INSERT OR IGNORE INTO app_state(tenant_id,version,state_json,updated_at) VALUES(?,1,'{}',CURRENT_TIMESTAMP)").bind(tenantId),
        env.DB.prepare(`INSERT OR REPLACE INTO entitlement_overrides(tenant_id,feature_key,enabled,limit_value,expires_at,reason,updated_at)
          SELECT ?,feature_key,1,CASE WHEN feature_key='ai_monthly_credits' THEN ? ELSE 2147483647 END,NULL,?,CURRENT_TIMESTAMP
          FROM (SELECT DISTINCT feature_key FROM plan_entitlements)`).bind(tenantId,PLATFORM_OWNER_AI_ALLOWANCE,PLATFORM_OWNER_OVERRIDE_REASON),
        env.DB.prepare("INSERT OR IGNORE INTO ai_credit_wallets(tenant_id,balance,monthly_allowance,monthly_reset_at,lifetime_purchased,lifetime_used,updated_at) VALUES(?,?,?,datetime('now','start of month','+1 month'),0,0,CURRENT_TIMESTAMP)")
          .bind(tenantId,PLATFORM_OWNER_AI_ALLOWANCE,PLATFORM_OWNER_AI_ALLOWANCE),
        env.DB.prepare("UPDATE ai_credit_wallets SET balance=MAX(balance,?),monthly_allowance=MAX(monthly_allowance,?),monthly_reset_at=COALESCE(monthly_reset_at,datetime('now','start of month','+1 month')),updated_at=CURRENT_TIMESTAMP WHERE tenant_id=?")
          .bind(PLATFORM_OWNER_AI_ALLOWANCE,PLATFORM_OWNER_AI_ALLOWANCE,tenantId)
      );
    }
    if(!principalReady){
      statements.push(env.DB.prepare("INSERT OR REPLACE INTO platform_regulatory_principals(user_id,email,role,active,provisioned_at) VALUES(?,?,'admin',1,CURRENT_TIMESTAMP)").bind(userId,PLATFORM_OWNER_EMAIL));
    }
    if(statements.length)await env.DB.batch(statements);
    repaired=true;
  }

  if(repaired){
    await env.DB.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data,occurred_at) VALUES(?,?,'platform_owner_access_repaired','user',?,'{\"access\":\"internal_full\",\"credential_changed\":false}',CURRENT_TIMESTAMP)")
      .bind(tenantId,userId,userId).run();
  }
  return tenantId;
}

async function sessionHmacHex(secret,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(secret||"")),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(String(value||"")));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function requestCookie(request,name){
  const header=String(request?.headers?.get?.("cookie")||"");
  for(const part of header.split(";")){
    const [key,...value]=part.trim().split("=");
    if(key===name){
      try{return decodeURIComponent(value.join("="))}catch{return value.join("=")}
    }
  }
  return null;
}

async function currentPlatformOwnerSession(request,env){
  const raw=requestCookie(request,"__Host-bw_session")||requestCookie(request,"bw_session");
  if(!raw||!env?.SESSION_SECRET||!env?.DB)return null;
  const tokenHash=await sessionHmacHex(env.SESSION_SECRET,raw);
  return env.DB.prepare(`SELECT s.user_id,s.tenant_id,u.email,m.role,m.status
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id
    WHERE s.token_hash=? AND s.session_generation=u.session_generation AND s.expires_at>CURRENT_TIMESTAMP
      AND lower(u.email)=? AND m.role='owner' AND m.status='active'
    LIMIT 1`).bind(tokenHash,PLATFORM_OWNER_EMAIL).first();
}

export async function repairPlatformOwnerWorkspaceAccess(request,env){
  const path=logicalRequestPath(request);
  if(!path.startsWith("/api/daily-reporting/")||!env?.DB)return false;
  const session=await currentPlatformOwnerSession(request,env);
  if(!session?.user_id||!session?.tenant_id)return false;
  return !!(await ensurePlatformOwnerAccess(env,session.user_id,session.tenant_id));
}

function withTenantId(request,body,tenantId){
  const headers=new Headers(request.headers);
  headers.set("content-type","application/json");
  return new Request(request,{headers,body:JSON.stringify({...body,tenantId})});
}

export function withPlatformOwnerAdminEnv(env){
  const runtimeEnv=Object.assign({},env||{});
  const current=String(env?.PLATFORM_ADMIN_EMAILS||"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(!current.includes(PLATFORM_OWNER_EMAIL))current.push(PLATFORM_OWNER_EMAIL);
  runtimeEnv.PLATFORM_ADMIN_EMAILS=current.join(",");
  return runtimeEnv;
}

export async function preparePlatformOwnerLogin(request,env){
  if(String(request?.method||"").toUpperCase()!=="POST"||logicalRequestPath(request)!=="/api/auth/login"||!env?.DB||!ownerLoginOriginAllowed(request,env))return request;
  let body;
  try{body=await request.clone().json()}catch{return request}
  const email=String(body?.email||"").trim().toLowerCase();
  const password=String(body?.password||"");
  if(email!==PLATFORM_OWNER_EMAIL||!password)return request;

  const user=await env.DB.prepare("SELECT id,password_hash FROM users WHERE lower(email)=? LIMIT 1").bind(PLATFORM_OWNER_EMAIL).first();
  if(!user?.id||!user?.password_hash)return request;
  if(!(await verifyStoredPassword(password,user.password_hash)))return request;

  const requestedTenantId=String(body?.tenantId||"").trim();
  const tenantId=await ensurePlatformOwnerAccess(env,user.id,requestedTenantId);
  if(!tenantId)return request;
  return withTenantId(request,body,tenantId);
}

export const __platformOwnerAccessTest=Object.freeze({
  PLATFORM_OWNER_EMAIL,
  PLATFORM_OWNER_AI_ALLOWANCE,
  PLATFORM_OWNER_OVERRIDE_REASON,
  verifyStoredPassword,
  ownerLoginOriginAllowed,
  logicalRequestPath
});
