import {appendSealedAuditEvent} from "./audit-lineage-writer.js";

const LEGAL_TERMS_VERSION="2026-10-14";
const LEGAL_PRIVACY_VERSION="2026-10-14";
const LEGAL_ACCEPTANCE_PATH="/api/auth/legal-acceptance";
const LEGAL_ACCEPTANCE_SURFACE="/legal-accept/";
const LEGAL_AUDIT_EVENT="LEGAL_ACCEPTANCE_RECORDED";
const encoder=new TextEncoder();

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    ...headers
  }});
}

function registrationLegalAccepted(body){
  return body?.legalAccepted===true||body?.legalAcceptance?.accepted===true;
}

function cookieValue(request,name){
  const raw=String(request.headers.get("cookie")||"");
  for(const part of raw.split(";")){
    const [key,...rest]=part.trim().split("=");
    if(key===name){
      try{return decodeURIComponent(rest.join("="))}catch{return rest.join("=")}
    }
  }
  return "";
}

async function hmacHex(secret,value){
  const key=await crypto.subtle.importKey("raw",encoder.encode(String(secret)),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,encoder.encode(String(value)));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function timingSafeText(left,right){
  const a=String(left||""),b=String(right||"");
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function sameOriginMutation(request){
  const supplied=String(request.headers.get("origin")||"").trim();
  if(!supplied)return false;
  try{return new URL(supplied).origin===new URL(request.url).origin}catch{return false}
}

async function readJsonBounded(request,maxBytes=8*1024){
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>maxBytes)return {body:{},tooLarge:true};
  const text=await request.text();
  if(encoder.encode(text).byteLength>maxBytes)return {body:{},tooLarge:true};
  if(!text)return {body:{},tooLarge:false};
  try{return {body:JSON.parse(text),tooLarge:false}}catch{return {body:{},tooLarge:false}}
}

async function currentLegalPolicy(env){
  if(!env?.DB)return null;
  const row=await env.DB.prepare("SELECT terms_version,privacy_version,effective_at FROM legal_acceptance_policy WHERE id=1 LIMIT 1").first();
  if(!row)return null;
  if(String(row.terms_version)!==LEGAL_TERMS_VERSION||String(row.privacy_version)!==LEGAL_PRIVACY_VERSION)throw new Error("legal_policy_version_mismatch");
  return row;
}

async function legalSessionContext(request,env){
  const raw=cookieValue(request,"__Host-bw_session")||cookieValue(request,"bw_session");
  if(!raw||!env?.SESSION_SECRET||!env?.DB)return null;
  const tokenHash=await hmacHex(env.SESSION_SECRET,raw);
  const row=await env.DB.prepare(`SELECT s.user_id,s.tenant_id,s.csrf_token,u.created_at,
      p.terms_version,p.privacy_version,p.effective_at,
      CASE WHEN datetime(u.created_at)>=datetime(p.effective_at) THEN 1 ELSE 0 END AS policy_applies,
      la.id AS acceptance_id,la.accepted_at,la.source AS acceptance_source,
      CASE WHEN ae.id IS NOT NULL THEN 1 ELSE 0 END AS audit_sealed
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN legal_acceptance_policy p ON p.id=1
    LEFT JOIN legal_acceptances la ON la.user_id=s.user_id AND la.tenant_id=s.tenant_id
      AND la.terms_version=p.terms_version AND la.privacy_version=p.privacy_version
    LEFT JOIN audit_events ae ON ae.tenant_id=s.tenant_id AND ae.event_type=?
      AND ae.entity_type='legal_acceptance' AND ae.entity_id=la.id
    WHERE s.token_hash=? AND s.session_generation=u.session_generation
      AND s.expires_at>CURRENT_TIMESTAMP
    LIMIT 1`).bind(LEGAL_AUDIT_EVENT,tokenHash).first();
  if(!row)return null;
  const requires=Number(row.policy_applies||0)===1&&(!row.acceptance_id||Number(row.audit_sealed||0)!==1);
  return {...row,requires};
}

async function existingUserByEmail(env,email){
  if(!env?.DB||!email)return null;
  return env.DB.prepare("SELECT id FROM users WHERE email=? LIMIT 1").bind(String(email).trim().toLowerCase()).first();
}

async function ownerContextByEmail(env,email){
  if(!env?.DB||!email)return null;
  return env.DB.prepare(`SELECT u.id AS user_id,m.tenant_id
    FROM users u JOIN memberships m ON m.user_id=u.id
    WHERE u.email=? AND m.role='owner' AND m.status='active'
    LIMIT 1`).bind(String(email).trim().toLowerCase()).first();
}

async function ensureLegalAcceptanceEvidence(env,{tenantId,userId,source}){
  const policy=await currentLegalPolicy(env);
  if(!policy||!tenantId||!userId)throw new Error("legal_policy_unavailable");
  let acceptance=await env.DB.prepare(`SELECT id,accepted_at,source FROM legal_acceptances
    WHERE tenant_id=? AND user_id=? AND terms_version=? AND privacy_version=? LIMIT 1`)
    .bind(tenantId,userId,policy.terms_version,policy.privacy_version).first();
  if(!acceptance){
    const acceptanceId=crypto.randomUUID(),acceptedAt=new Date().toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO legal_acceptances(
      id,tenant_id,user_id,terms_version,privacy_version,accepted_at,source
    ) VALUES(?,?,?,?,?,?,?)`).bind(
      acceptanceId,tenantId,userId,policy.terms_version,policy.privacy_version,acceptedAt,String(source||"unknown")
    ).run();
    acceptance=await env.DB.prepare(`SELECT id,accepted_at,source FROM legal_acceptances
      WHERE tenant_id=? AND user_id=? AND terms_version=? AND privacy_version=? LIMIT 1`)
      .bind(tenantId,userId,policy.terms_version,policy.privacy_version).first();
  }
  if(!acceptance?.id)throw new Error("legal_acceptance_persistence_failed");
  const sealed=await env.DB.prepare(`SELECT id FROM audit_events
    WHERE tenant_id=? AND event_type=? AND entity_type='legal_acceptance' AND entity_id=? LIMIT 1`)
    .bind(tenantId,LEGAL_AUDIT_EVENT,acceptance.id).first();
  if(!sealed){
    await appendSealedAuditEvent(env,{
      tenantId,
      actorUserId:userId,
      eventType:LEGAL_AUDIT_EVENT,
      entityType:"legal_acceptance",
      entityId:acceptance.id,
      eventData:{
        termsVersion:String(policy.terms_version),
        privacyVersion:String(policy.privacy_version),
        acceptedAt:String(acceptance.accepted_at),
        source:String(acceptance.source||source||"unknown")
      },
      writeSource:"release-governance"
    });
  }
  return {
    ok:true,
    acceptanceId:String(acceptance.id),
    acceptedAt:String(acceptance.accepted_at),
    termsVersion:String(policy.terms_version),
    privacyVersion:String(policy.privacy_version),
    auditSealed:true
  };
}

async function recordRegistrationLegalAcceptance(env,email){
  const owner=await ownerContextByEmail(env,email);
  if(!owner)return {ok:false,reason:"registration_owner_not_found"};
  return ensureLegalAcceptanceEvidence(env,{tenantId:owner.tenant_id,userId:owner.user_id,source:"password_registration"});
}

function legalAcceptanceRequiredResponse(){
  return json({
    error:"legal_acceptance_required",
    message:"Agree to the Terms of Service and acknowledge the Privacy Notice to continue.",
    legalAcceptUrl:LEGAL_ACCEPTANCE_SURFACE,
    termsVersion:LEGAL_TERMS_VERSION,
    privacyVersion:LEGAL_PRIVACY_VERSION
  },428);
}

function legalGateAllowlisted(path){
  if(path===LEGAL_ACCEPTANCE_PATH)return true;
  if(path==="/api/auth/me"||path==="/api/auth/logout")return true;
  if(path==="/api/version"||path==="/api/ready")return true;
  if(path==="/api/auth/registration-policy"||path==="/api/auth/oauth/providers")return true;
  if(path==="/api/auth/register"||path==="/api/auth/registration-proof/challenge")return true;
  if(path.startsWith("/api/auth/oauth/"))return true;
  return false;
}

async function enforceLegalAcceptanceGate(request,env,path){
  const session=await legalSessionContext(request,env);
  if(!session?.requires)return null;
  if(legalGateAllowlisted(path))return null;
  if(path.startsWith("/api/"))return legalAcceptanceRequiredResponse();
  if(path==="/"||path==="/app"||path==="/app/"){
    const target=new URL(LEGAL_ACCEPTANCE_SURFACE,request.url);
    return Response.redirect(target.toString(),302);
  }
  return null;
}

async function handleLegalAcceptanceRequest(request,env){
  if(request.method!=="POST")return json({error:"method_not_allowed"},405,{allow:"POST"});
  if(!sameOriginMutation(request))return json({error:"origin_failed"},403);
  const session=await legalSessionContext(request,env);
  if(!session)return json({error:"unauthorized"},401);
  const csrf=String(request.headers.get("x-csrf-token")||"");
  if(!csrf||!timingSafeText(csrf,String(session.csrf_token||"")))return json({error:"csrf_failed"},403);
  const parsed=await readJsonBounded(request);
  if(parsed.tooLarge)return json({error:"payload_too_large"},413);
  if(parsed.body?.accepted!==true)return legalAcceptanceRequiredResponse();
  try{
    const recorded=await ensureLegalAcceptanceEvidence(env,{tenantId:session.tenant_id,userId:session.user_id,source:"authenticated_legal_interstitial"});
    return json(recorded,200);
  }catch(error){
    return json({error:"legal_acceptance_persistence_failed",message:"Your acceptance could not be sealed into the audit record. Try again."},503,{"retry-after":"30"});
  }
}

export {
  LEGAL_ACCEPTANCE_PATH,
  LEGAL_ACCEPTANCE_SURFACE,
  LEGAL_PRIVACY_VERSION,
  LEGAL_TERMS_VERSION,
  enforceLegalAcceptanceGate,
  existingUserByEmail,
  handleLegalAcceptanceRequest,
  legalAcceptanceRequiredResponse,
  legalSessionContext,
  recordRegistrationLegalAcceptance,
  registrationLegalAccepted
};
