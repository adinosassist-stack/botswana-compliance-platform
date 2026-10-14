import base from "./release-governance-entry.js";
import {appendSealedAuditEvent} from "./audit-lineage-writer.js";

export const LEGAL_ACCEPTANCE_VERSION="2026-10-14";
const REGISTER_PATH="/api/auth/register";
const OAUTH_CALLBACK_RE=/^\/api\/auth\/oauth\/(google|facebook)\/callback$/;
const MAX_OAUTH_JSON_BYTES=128*1024;

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    ...headers
  }});
}

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

function cookieValue(request,name){
  const header=String(request.headers.get("cookie")||"");
  for(const part of header.split(";")){
    const index=part.indexOf("=");
    if(index<0)continue;
    const key=part.slice(0,index).trim();
    if(key!==name)continue;
    try{return decodeURIComponent(part.slice(index+1).trim())}catch{return part.slice(index+1).trim()}
  }
  return "";
}

function b64url(bytes){
  let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll("=","").replaceAll("+","-").replaceAll("/","_");
}
function base64UrlDecodeText(value){
  const raw=String(value||"").replaceAll("-","+").replaceAll("_","/");
  const padded=raw+"=".repeat((4-raw.length%4)%4);
  const binary=atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary,ch=>ch.charCodeAt(0)));
}
async function hmacHex(secret,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(secret)),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(String(value)));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
function timingSafeText(left,right){
  const a=String(left||""),b=String(right||"");if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}

async function decodeOauthState(env,state){
  try{
    const [raw,sig]=String(state||"").split(".");
    if(!raw||!sig||String(env?.SESSION_SECRET||"").length<32)return null;
    const expected=await hmacHex(env.SESSION_SECRET,raw);
    if(!timingSafeText(sig,expected))return null;
    const payload=JSON.parse(base64UrlDecodeText(raw));
    return payload&&typeof payload==="object"?payload:null;
  }catch{return null}
}

function oauthStateCookieName(provider){return `__Host-bw_oauth_state_${provider}`}
function clearOauthStateCookie(provider){return `${oauthStateCookieName(provider)}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`}
function sessionCookie(token,maxAge=1209600){return `__Host-bw_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`}

function safeNextPath(value,request){
  try{
    const origin=new URL(request.url).origin;
    const resolved=new URL(String(value||"/app/"),origin);
    if(resolved.origin!==origin)return "/app/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`||"/app/";
  }catch{return "/app/"}
}

function validOauthRedirectUri(env,provider,value){
  try{
    const publicOrigin=new URL(String(env?.PUBLIC_ORIGIN||""));
    const url=new URL(String(value||""));
    if(publicOrigin.protocol!=="https:"||url.protocol!=="https:"||url.username||url.password)return null;
    if(url.origin!==publicOrigin.origin||url.pathname!==`/api/auth/oauth/${provider}/callback`||url.search||url.hash)return null;
    return url.href;
  }catch{return null}
}

function oauthProviderConfig(env,provider){
  if(provider==="google"&&env?.GOOGLE_OAUTH_CLIENT_ID&&env?.GOOGLE_OAUTH_CLIENT_SECRET){
    const redirectUri=validOauthRedirectUri(env,provider,env.GOOGLE_OAUTH_REDIRECT_URI);if(!redirectUri)return null;
    return {provider,clientId:env.GOOGLE_OAUTH_CLIENT_ID,clientSecret:env.GOOGLE_OAUTH_CLIENT_SECRET,redirectUri,
      tokenUrl:"https://oauth2.googleapis.com/token",userInfoUrl:"https://openidconnect.googleapis.com/v1/userinfo"};
  }
  if(provider==="facebook"&&env?.FACEBOOK_APP_ID&&env?.FACEBOOK_APP_SECRET){
    const redirectUri=validOauthRedirectUri(env,provider,env.FACEBOOK_OAUTH_REDIRECT_URI);if(!redirectUri)return null;
    const graph=String(env.FACEBOOK_GRAPH_VERSION||"v23.0");
    return {provider,clientId:env.FACEBOOK_APP_ID,clientSecret:env.FACEBOOK_APP_SECRET,redirectUri,
      tokenUrl:`https://graph.facebook.com/${graph}/oauth/access_token`,userInfoUrl:`https://graph.facebook.com/${graph}/me?fields=id,name,email`};
  }
  return null;
}

async function externalFetch(url,options={},timeoutMs=10000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort("oauth_timeout"),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal,redirect:"error"})}finally{clearTimeout(timer)}
}
async function boundedJson(response,maxBytes=MAX_OAUTH_JSON_BYTES){
  const buffer=await response.arrayBuffer();if(buffer.byteLength>maxBytes)throw new Error("oauth_response_too_large");
  try{return JSON.parse(new TextDecoder().decode(buffer))}catch{throw new Error("oauth_response_invalid_json")}
}
async function exchangeOauthCode(cfg,code){
  if(cfg.provider==="google"){
    const body=new URLSearchParams({code,client_id:cfg.clientId,client_secret:cfg.clientSecret,redirect_uri:cfg.redirectUri,grant_type:"authorization_code"});
    const response=await externalFetch(cfg.tokenUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
    if(!response.ok)throw new Error("oauth_token_exchange_failed");return boundedJson(response);
  }
  const url=new URL(cfg.tokenUrl);url.searchParams.set("client_id",cfg.clientId);url.searchParams.set("client_secret",cfg.clientSecret);url.searchParams.set("redirect_uri",cfg.redirectUri);url.searchParams.set("code",code);
  const response=await externalFetch(url.toString());if(!response.ok)throw new Error("oauth_token_exchange_failed");return boundedJson(response);
}
async function fetchOauthProfile(cfg,tokens){
  const response=await externalFetch(cfg.userInfoUrl,{headers:{Authorization:`Bearer ${String(tokens?.access_token||"")}`}});
  if(!response.ok)throw new Error("oauth_profile_failed");const profile=await boundedJson(response);
  if(cfg.provider==="google")return {providerId:String(profile?.sub||""),email:String(profile?.email||"").trim().toLowerCase(),emailVerified:profile?.email_verified===true};
  return {providerId:String(profile?.id||""),email:String(profile?.email||"").trim().toLowerCase(),emailVerified:!!profile?.email};
}

async function createSession(env,userId,tenantId,role){
  const raw=b64url(crypto.getRandomValues(new Uint8Array(32)));
  const csrf=b64url(crypto.getRandomValues(new Uint8Array(24)));
  const hash=await hmacHex(env.SESSION_SECRET,raw);
  const publicId=crypto.randomUUID();
  const inserted=await env.DB.prepare(`INSERT INTO sessions(token_hash,public_id,user_id,tenant_id,role,session_generation,csrf_token,expires_at,last_seen_at)
    SELECT ?,?,?,?,?,session_generation,?,datetime('now','+14 days'),CURRENT_TIMESTAMP FROM users
    WHERE id=? AND EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND tenant_id=? AND status='active' AND role=?)
    RETURNING session_generation`).bind(hash,publicId,userId,tenantId,role,csrf,userId,userId,tenantId,role).first();
  if(inserted?.session_generation===undefined||inserted?.session_generation===null)throw new Error("session_user_not_found");
  return {raw,csrf};
}

async function consumeOauthCallbackBudget(request,env){
  if(!env?.DB||String(env?.SESSION_SECRET||"").length<32)return {ok:false,retryAfter:60};
  const now=Date.now(),windowMs=10*60*1000,bucket=Math.floor(now/windowMs);
  const ip=String(request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
  const keyHash=await hmacHex(`${env.SESSION_SECRET}|oauth-existing-signin-v1`,`${bucket}|${ip||"unknown"}`);
  const expiresAt=new Date((bucket+2)*windowMs).toISOString();
  try{
    await env.DB.prepare(`INSERT INTO auth_rate_limits(key_hash,scope,count,window_start,expires_at)
      VALUES(?,?,1,?,?) ON CONFLICT(key_hash) DO UPDATE SET count=auth_rate_limits.count+1`)
      .bind(keyHash,"oauth_existing_signin_ip",bucket,expiresAt).run();
    const row=await env.DB.prepare("SELECT count FROM auth_rate_limits WHERE key_hash=? LIMIT 1").bind(keyHash).first();
    return {ok:Number(row?.count||0)>0&&Number(row?.count||0)<=30,retryAfter:Math.max(1,Math.ceil((((bucket+1)*windowMs)-now)/1000))};
  }catch{return {ok:false,retryAfter:60}}
}

async function oauthExistingIdentityCallback(request,env,ctx,provider){
  const url=new URL(request.url),returned=String(url.searchParams.get("state")||""),expected=cookieValue(request,oauthStateCookieName(provider));
  if(!returned||!expected||!timingSafeText(returned,expected))return json({error:"oauth_state_invalid"},400,{"set-cookie":clearOauthStateCookie(provider)});
  const state=await decodeOauthState(env,returned);
  if(!state||state.provider!==provider||!Number.isFinite(Number(state.iat))||Date.now()-Number(state.iat)>10*60*1000)return json({error:"oauth_state_expired"},400,{"set-cookie":clearOauthStateCookie(provider)});
  if(state.mode==="link")return base.fetch(request,env,ctx);
  if(url.searchParams.get("error"))return Response.redirect(new URL(`/auth/?mode=login&oauth_error=${encodeURIComponent(String(url.searchParams.get("error")))}`,request.url).toString(),302);
  const budget=await consumeOauthCallbackBudget(request,env);if(!budget.ok)return json({error:"too_many_attempts"},429,{"retry-after":String(budget.retryAfter)});
  const code=String(url.searchParams.get("code")||"");if(!code)return json({error:"oauth_code_missing"},400,{"set-cookie":clearOauthStateCookie(provider)});
  const cfg=oauthProviderConfig(env,provider);if(!cfg)return json({error:"oauth_provider_not_configured"},503,{"set-cookie":clearOauthStateCookie(provider)});
  try{
    const tokens=await exchangeOauthCode(cfg,code),profile=await fetchOauthProfile(cfg,tokens);
    if(!profile.providerId||!profile.email)return json({error:"oauth_profile_incomplete"},400,{"set-cookie":clearOauthStateCookie(provider)});
    if(provider==="google"&&!profile.emailVerified)return json({error:"oauth_email_not_verified"},400,{"set-cookie":clearOauthStateCookie(provider)});
    const identity=await env.DB.prepare(`SELECT u.id,u.email FROM external_identities e JOIN users u ON u.id=e.user_id
      WHERE e.provider=? AND e.provider_user_id=? LIMIT 1`).bind(provider,profile.providerId).first();
    if(!identity){
      const target=new URL("/auth/",request.url);target.searchParams.set("mode","register");target.searchParams.set("oauth_error","account_creation_requires_legal_acceptance");
      const headers=new Headers({location:target.toString(),"cache-control":"no-store","set-cookie":clearOauthStateCookie(provider)});
      return new Response(null,{status:302,headers});
    }
    const membership=await env.DB.prepare("SELECT tenant_id,role FROM memberships WHERE user_id=? AND status='active' ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END LIMIT 1").bind(identity.id).first();
    if(!membership)return json({error:"oauth_membership_missing"},409,{"set-cookie":clearOauthStateCookie(provider)});
    const session=await createSession(env,identity.id,membership.tenant_id,membership.role);
    const headers=new Headers({location:new URL(safeNextPath(state.next||"/app/",request),request.url).toString(),"cache-control":"no-store"});
    headers.append("set-cookie",sessionCookie(session.raw));headers.append("set-cookie",clearOauthStateCookie(provider));
    ctx?.waitUntil?.(appendSealedAuditEvent(env,{tenantId:membership.tenant_id,actorUserId:identity.id,eventType:"SOCIAL_LOGIN",entityType:"account",entityId:identity.id,eventData:{provider,existingLinkedIdentity:true},writeSource:"legal-acceptance-entry"}).catch(()=>{}));
    return new Response(null,{status:302,headers});
  }catch(error){
    return json({error:"oauth_signin_failed",message:"Social sign-in could not be completed. Use your existing account sign-in or try again."},502,{"set-cookie":clearOauthStateCookie(provider)});
  }
}

async function lookupOwnerIdentity(env,email){
  if(!env?.DB||!email)return null;
  return env.DB.prepare(`SELECT u.id AS user_id,m.tenant_id FROM users u JOIN memberships m ON m.user_id=u.id
    WHERE lower(u.email)=lower(?) AND m.role='owner' AND m.status='active' ORDER BY u.created_at ASC LIMIT 1`).bind(email).first();
}
async function legalAcceptanceAlreadyRecorded(env,identity){
  if(!identity)return false;
  const row=await env.DB.prepare("SELECT 1 ok FROM audit_events WHERE tenant_id=? AND actor_user_id=? AND event_type='LEGAL_ACCEPTANCE_RECORDED' AND event_data LIKE ? LIMIT 1")
    .bind(identity.tenant_id,identity.user_id,`%${LEGAL_ACCEPTANCE_VERSION}%`).first();
  return !!row?.ok;
}
async function unresolvedLegalAuditFailure(env,identity){
  if(!identity)return false;
  const row=await env.DB.prepare("SELECT 1 ok FROM audit_write_failures WHERE tenant_id=? AND actor_user_id=? AND event_type='LEGAL_ACCEPTANCE_RECORDED' AND resolved_at IS NULL AND created_at>=datetime('now','-15 minutes') LIMIT 1")
    .bind(identity.tenant_id,identity.user_id).first();
  return !!row?.ok;
}
async function recordLegalAcceptance(env,identity,email,source){
  if(!identity||await legalAcceptanceAlreadyRecorded(env,identity))return true;
  await appendSealedAuditEvent(env,{tenantId:identity.tenant_id,actorUserId:identity.user_id,eventType:"LEGAL_ACCEPTANCE_RECORDED",entityType:"account",entityId:identity.user_id,eventData:{termsAccepted:true,privacyAcknowledged:true,termsVersion:LEGAL_ACCEPTANCE_VERSION,privacyVersion:LEGAL_ACCEPTANCE_VERSION,acceptedAt:new Date().toISOString(),source,email},writeSource:"legal-acceptance-entry"});
  await env.DB.prepare("UPDATE audit_write_failures SET resolved_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND actor_user_id=? AND event_type='LEGAL_ACCEPTANCE_RECORDED' AND resolved_at IS NULL")
    .bind(identity.tenant_id,identity.user_id).run().catch?.(()=>{});
  return true;
}

async function handleRegistration(request,env,ctx){
  let body={};try{body=await request.clone().json()}catch{}
  const accepted=body?.acceptLegal===true&&String(request.headers.get("x-thebe-legal-acceptance")||"").trim()===LEGAL_ACCEPTANCE_VERSION;
  if(!accepted)return json({error:"legal_acceptance_required",message:"Agree to the current Terms of Service and acknowledge the Privacy Notice before creating an account.",legalVersion:LEGAL_ACCEPTANCE_VERSION},400);
  const email=String(body?.email||"").trim().toLowerCase();
  const before=await lookupOwnerIdentity(env,email);
  const response=await base.fetch(request,env,ctx);
  if(response.status!==202||!email)return response;
  const after=await lookupOwnerIdentity(env,email);
  if(!after)return response;
  const shouldRecord=!before||await unresolvedLegalAuditFailure(env,after);
  if(!shouldRecord)return response;
  try{
    await recordLegalAcceptance(env,after,email,"password_registration");
    const headers=new Headers(response.headers);headers.set("x-thebe-legal-acceptance","recorded");
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }catch{
    return json({error:"legal_acceptance_audit_unavailable",message:"Your account details were received, but the legal acceptance record could not be sealed. Click Create account again to safely finish setup.",retryable:true},503,{"retry-after":"1"});
  }
}

export default {
  async fetch(request,env,ctx){
    const path=logicalRequestPath(request),method=String(request.method||"GET").toUpperCase();
    if(path===REGISTER_PATH&&method==="POST")return handleRegistration(request,env,ctx);
    const oauth=path.match(OAUTH_CALLBACK_RE);
    if(oauth&&method==="GET")return oauthExistingIdentityCallback(request,env,ctx,oauth[1]);
    return base.fetch(request,env,ctx);
  }
};
