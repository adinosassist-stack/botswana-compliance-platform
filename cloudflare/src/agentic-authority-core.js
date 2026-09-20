import {AGENT_ACTION_CATALOG,THEBE_AGENTS,THEBE_CAPABILITIES,agentCanRouteAction,resolveAgentKey} from "./agent-policy.js";
import {AUTONOMY_LEVELS,DELEGATED_AUTHORITY_VERSION,evaluateDelegatedAuthority,isNeverAutonomousAction,normalizeDelegation,requiredAutonomyLevel} from "./delegated-authority.js";

const MAX_BODY_BYTES=8192;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const text=(value,max=500)=>String(value??"").trim().slice(0,max);
const id=()=>crypto.randomUUID();

function cookie(request,name){
  const raw=request.headers.get("cookie")||"";
  for(const part of raw.split(";")){
    const [key,...rest]=part.trim().split("=");
    if(key===name)return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function hmacHex(secret,value){
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,encoder.encode(value));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function authenticate(request,env){
  const raw=cookie(request,"__Host-bw_session")||cookie(request,"bw_session");
  const secret=String(env?.SESSION_SECRET||"");
  if(!raw||!secret||!env?.DB)return null;
  const tokenHash=await hmacHex(secret,raw);
  return await env.DB.prepare(`SELECT s.user_id,s.tenant_id,s.csrf_token,m.role,u.email
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id AND m.status='active'
    WHERE s.token_hash=? AND s.session_generation=u.session_generation AND s.expires_at>CURRENT_TIMESTAMP
    LIMIT 1`).bind(tokenHash).first();
}

function roleAllowed(auth,...roles){return roles.includes(String(auth?.role||"").toLowerCase())}
function originAllowed(request,env){
  const origin=text(request.headers.get("origin"),300);
  if(!origin)return true;
  try{
    const expected=new URL(String(env?.PUBLIC_ORIGIN||env?.PUBLIC_APP_URL||""));
    return new URL(origin).origin===expected.origin;
  }catch{return false}
}
function csrfAllowed(request,auth){
  const supplied=String(request.headers.get("x-csrf-token")||"");
  const expected=String(auth?.csrf_token||"");
  return !!supplied&&!!expected&&supplied===expected;
}
async function readJson(request){
  const encoding=String(request.headers.get("content-encoding")||"").trim().toLowerCase();
  if(encoding&&encoding!=="identity")throw new Error("unsupported_content_encoding");
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new Error("request_too_large");
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new Error("request_too_large");
  if(!raw)return {};
  try{return JSON.parse(raw)}catch{throw new Error("invalid_json")}
}
function requestBodyErrorStatus(error){
  if(error?.message==="request_too_large")return 413;
  if(error?.message==="unsupported_content_encoding")return 415;
  return 400;
}
async function safeAll(env,sql,bindings=[]){
  try{return await env.DB.prepare(sql).bind(...bindings).all()}catch{return null}
}
async function safeFirst(env,sql,bindings=[]){
  try{return await env.DB.prepare(sql).bind(...bindings).first()}catch{return null}
}
function validIso(value){
  if(value==null||value==="")return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
function boundedInt(value,{min=0,max=1000,nullable=false}={}){
  if(nullable&&(value==null||value===""))return null;
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max)return undefined;
  return n;
}
function actionStatus(decision){
  if(decision==="shadow_allow"||decision==="policy_allow")return "ready";
  if(decision==="review_required")return "review_required";
  return "blocked";
}
function strongAuthPresent(){
  // Stage 1.5 has no server-attested strong-auth integration yet. Never trust a
  // client-controlled header or body field as proof of strong authentication.
  return "none";
}

async function schemaReady(env){
  const row=await safeFirst(env,"SELECT 1 ok FROM agent_delegations LIMIT 1");
  if(row)return true;
  try{
    await env.DB.prepare("SELECT COUNT(*) count FROM agent_delegations").first();
    return true;
  }catch{return false}
}

function delegationForApi(row){
  const normalized=normalizeDelegation(row);
  if(!normalized)return null;
  const legacyAgentKey=normalized.agentKey&&normalized.agentKey!=="thebe"?normalized.agentKey:null;
  const action=AGENT_ACTION_CATALOG[normalized.actionKey];
  return Object.freeze({...normalized,agentKey:"thebe",legacyAgentKey,capability:action?.capability||"core"});
}

async function listDelegations(env,auth){
  const rows=await safeAll(env,`SELECT id,agent_key,action_key,status,max_autonomy_level,external_side_effects,strong_auth_required,
    human_confirmation_required,max_daily_actions,max_amount_minor,shadow_only,valid_from,expires_at,created_at,updated_at
    FROM agent_delegations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100`,[auth.tenant_id]);
  if(!rows)return json({error:"authority_schema_not_ready"},503);
  return json({items:(rows.results||[]).map(delegationForApi),agentKey:"thebe",executionEnabled:false,mode:"shadow_only"});
}

async function status(env,auth){
  const ready=await schemaReady(env);
  let activeDelegations=0;
  if(ready){
    const count=await safeFirst(env,`SELECT COUNT(*) count FROM agent_delegations
      WHERE tenant_id=? AND status='active' AND (valid_from IS NULL OR valid_from<=CURRENT_TIMESTAMP)
      AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`,[auth.tenant_id]);
    activeDelegations=Number(count?.count||0);
  }
  return json({
    enabled:true,
    policyVersion:DELEGATED_AUTHORITY_VERSION,
    stage:"delegated_authority_shadow",
    schemaReady:ready,
    executionEnabled:false,
    shadowOnly:true,
    strongAuthIntegrationReady:false,
    activeDelegations,
    agent:{key:"thebe",label:THEBE_AGENTS.thebe.label},
    capabilities:Object.values(THEBE_CAPABILITIES).map(({key,label,enabled})=>({key,label,enabled})),
    autonomyLevels:AUTONOMY_LEVELS,
    guarantees:[
      "no_external_side_effect_execution",
      "human_only_high_risk_actions",
      "tenant_scoped_delegations",
      "owner_approved_grants",
      "idempotent_shadow_intents",
      "auditable_policy_decisions",
      "client_headers_cannot_attest_strong_auth"
    ]
  });
}

async function createDelegation({request,env,auth}){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await schemaReady(env)))return json({error:"authority_schema_not_ready"},503);
  let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  const requestedAgentKey=text(body?.agentKey,80),actionKey=text(body?.actionKey,120);
  const agentKey=resolveAgentKey(requestedAgentKey),agent=agentKey?THEBE_AGENTS[agentKey]:null,definition=AGENT_ACTION_CATALOG[actionKey];
  if(!agent)return json({error:"unknown_agent"},400);
  if(!definition)return json({error:"unknown_action"},400);
  if(!agentCanRouteAction(requestedAgentKey,definition))return json({error:"agent_action_mismatch"},400);
  if(!definition.roles.includes("owner"))return json({error:"owner_not_authorized_for_action"},400);
  if(isNeverAutonomousAction(actionKey)||requiredAutonomyLevel(definition)>=AUTONOMY_LEVELS.HUMAN_ONLY){
    return json({error:"human_only_action",message:"High-risk actions cannot receive autonomous delegation."},409);
  }
  const required=requiredAutonomyLevel(definition);
  if(required<AUTONOMY_LEVELS.BOUNDED_EXECUTE){
    return json({error:"delegation_not_required",message:"Read and prepare actions use the existing agent policy and do not need a bounded-execution grant."},409);
  }
  const duplicate=await safeFirst(env,`SELECT id FROM agent_delegations WHERE tenant_id=? AND agent_key='thebe' AND action_key=? AND status='active' LIMIT 1`,[auth.tenant_id,actionKey]);
  if(duplicate)return json({error:"active_delegation_exists",delegationId:duplicate.id},409);
  const maxAutonomyLevel=boundedInt(body?.maxAutonomyLevel,{min:required,max:AUTONOMY_LEVELS.BOUNDED_EXECUTE});
  if(maxAutonomyLevel===undefined)return json({error:"invalid_autonomy_level"},400);
  const maxDailyActions=boundedInt(body?.maxDailyActions,{min:1,max:1000,nullable:true});
  if(maxDailyActions===undefined)return json({error:"invalid_daily_action_limit"},400);
  const maxAmountMinor=boundedInt(body?.maxAmountMinor,{min:0,max:Number.MAX_SAFE_INTEGER,nullable:true});
  if(maxAmountMinor===undefined)return json({error:"invalid_amount_limit"},400);
  const validFrom=validIso(body?.validFrom),expiresAt=validIso(body?.expiresAt);
  if(body?.validFrom&&!validFrom)return json({error:"invalid_valid_from"},400);
  if(body?.expiresAt&&!expiresAt)return json({error:"invalid_expires_at"},400);
  if(validFrom&&expiresAt&&new Date(expiresAt)<=new Date(validFrom))return json({error:"invalid_delegation_window"},400);

  const externalSideEffects=definition.externalSideEffect&&body?.externalSideEffects===true?1:0;
  const strongAuthRequired=externalSideEffects?1:(body?.strongAuthRequired===true?1:0);
  const humanConfirmationRequired=1;
  const delegationId=id();
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO agent_delegations(id,tenant_id,agent_key,action_key,status,max_autonomy_level,external_side_effects,strong_auth_required,
        human_confirmation_required,max_daily_actions,max_amount_minor,shadow_only,valid_from,expires_at,created_by_user_id,approved_by_user_id)
        VALUES(?,?,?,?, 'active',?,?,?,?,?,?,1,?,?,?,?,?)`).bind(
          delegationId,auth.tenant_id,agentKey,actionKey,maxAutonomyLevel,externalSideEffects,strongAuthRequired,humanConfirmationRequired,
          maxDailyActions,maxAmountMinor,validFrom,expiresAt,auth.user_id,auth.user_id
        ),
      env.DB.prepare(`INSERT INTO agent_delegation_events(id,tenant_id,delegation_id,event_type,actor_user_id,detail_json)
        VALUES(?,?,?,'CREATED',?,?)`).bind(id(),auth.tenant_id,delegationId,auth.user_id,JSON.stringify({agentKey,actionKey,maxAutonomyLevel,shadowOnly:true}))
    ]);
  }catch{
    const current=await safeFirst(env,`SELECT id FROM agent_delegations WHERE tenant_id=? AND agent_key='thebe' AND action_key=? AND status='active' LIMIT 1`,[auth.tenant_id,actionKey]);
    if(current)return json({error:"active_delegation_exists",delegationId:current.id},409);
    return json({error:"delegation_create_failed"},500);
  }
  const row=await env.DB.prepare(`SELECT * FROM agent_delegations WHERE id=? AND tenant_id=? LIMIT 1`).bind(delegationId,auth.tenant_id).first();
  return json({ok:true,delegation:delegationForApi(row),execution:{enabled:false,shadowOnly:true}},201);
}

async function mutateDelegation({env,auth,delegationId,command}){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await schemaReady(env)))return json({error:"authority_schema_not_ready"},503);
  const row=await env.DB.prepare(`SELECT id,status FROM agent_delegations WHERE id=? AND tenant_id=? LIMIT 1`).bind(delegationId,auth.tenant_id).first();
  if(!row)return json({error:"delegation_not_found"},404);
  const next=command==="pause"?"paused":"revoked";
  const allowedCurrent=command==="pause"?new Set(["active"]):new Set(["active","paused"]);
  if(!allowedCurrent.has(String(row.status||""))){
    const error=row.status==="revoked"?"delegation_already_revoked":"delegation_state_conflict";
    return json({error,status:row.status},409);
  }
  const updateSql=command==="pause"
    ?`UPDATE agent_delegations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='active'`
    :`UPDATE agent_delegations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status IN ('active','paused')`;
  const results=await env.DB.batch([
    env.DB.prepare(updateSql).bind(next,delegationId,auth.tenant_id),
    env.DB.prepare(`INSERT INTO agent_delegation_events(id,tenant_id,delegation_id,event_type,actor_user_id,detail_json)
      SELECT ?,?,?,?,?,'{}' WHERE changes()=1`).bind(id(),auth.tenant_id,delegationId,next==="paused"?"PAUSED":"REVOKED",auth.user_id)
  ]);
  const changed=Number(results?.[0]?.meta?.changes??results?.[0]?.changes??0);
  if(changed!==1){
    const current=await env.DB.prepare(`SELECT status FROM agent_delegations WHERE id=? AND tenant_id=? LIMIT 1`).bind(delegationId,auth.tenant_id).first();
    if(!current)return json({error:"delegation_not_found"},404);
    return json({error:current.status==="revoked"?"delegation_already_revoked":"delegation_state_conflict",status:current.status},409);
  }
  return json({ok:true,id:delegationId,status:next,executionEnabled:false});
}

async function activeDelegation(env,tenantId,requestedAgentKey,actionKey){
  const requested=String(requestedAgentKey||"").trim().toLowerCase();
  const validity=`AND (valid_from IS NULL OR valid_from<=CURRENT_TIMESTAMP)
      AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`;
  if(requested==="thebe"){
    return await safeFirst(env,`SELECT * FROM agent_delegations
      WHERE tenant_id=? AND agent_key='thebe' AND action_key=? AND status='active' ${validity}
      ORDER BY created_at DESC LIMIT 1`,[tenantId,actionKey]);
  }
  return await safeFirst(env,`SELECT * FROM agent_delegations
    WHERE tenant_id=? AND agent_key IN ('thebe',?) AND action_key=? AND status='active' ${validity}
    ORDER BY CASE WHEN agent_key='thebe' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`,[tenantId,requested,actionKey]);
}

async function shadowEvaluate({request,env,auth}){
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(!(await schemaReady(env)))return json({error:"authority_schema_not_ready"},503);
  const idem=text(request.headers.get("idempotency-key"),200);
  if(idem.length<8)return json({error:"idempotency_key_required"},400);
  const existing=await safeFirst(env,`SELECT id,decision,decision_code,status,payload_hash,created_at FROM agent_action_intents WHERE tenant_id=? AND idempotency_key=? LIMIT 1`,[auth.tenant_id,idem]);
  let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  const requestedAgentKey=text(body?.agentKey,80),actionKey=text(body?.actionKey,120);
  const agentKey=resolveAgentKey(requestedAgentKey),agent=agentKey?THEBE_AGENTS[agentKey]:null,definition=AGENT_ACTION_CATALOG[actionKey];
  if(!agent)return json({error:"unknown_agent"},400);
  if(!definition)return json({error:"unknown_action"},400);
  if(!agentCanRouteAction(requestedAgentKey,definition))return json({error:"agent_action_mismatch"},403);
  const role=String(auth.role||"").toLowerCase();
  if(!agent.allowedRoles.includes(role)||!definition.roles.includes(role))return json({error:"role_forbidden"},403);
  const amountMinor=boundedInt(body?.amountMinor,{min:0,max:Number.MAX_SAFE_INTEGER,nullable:false});
  if(amountMinor===undefined)return json({error:"invalid_amount_minor"},400);

  const runId=body?.runId?text(body.runId,120):null;
  const proposalId=body?.proposalId?text(body.proposalId,120):null;
  if(runId){
    const run=await safeFirst(env,"SELECT id FROM agentic_runs WHERE id=? AND tenant_id=? LIMIT 1",[runId,auth.tenant_id]);
    if(!run)return json({error:"run_not_found"},404);
  }
  if(proposalId){
    const proposal=await safeFirst(env,"SELECT id FROM agentic_proposals WHERE id=? AND tenant_id=? LIMIT 1",[proposalId,auth.tenant_id]);
    if(!proposal)return json({error:"proposal_not_found"},404);
  }
  const metadata=body?.metadata&&typeof body.metadata==="object"&&!Array.isArray(body.metadata)?body.metadata:{};
  const canonical=JSON.stringify({agentKey,actionKey,amountMinor,humanConfirmed:body?.humanConfirmed===true,runId,proposalId,metadata});
  const payloadHash=await sha256Hex(canonical);
  if(existing){
    if(String(existing.payload_hash||"")!==payloadHash)return json({error:"idempotency_key_conflict"},409);
    const {payload_hash,...intent}=existing;
    return json({ok:true,replayed:true,intent,execution:{performed:false,enabled:false}},200);
  }

  const grant=await activeDelegation(env,auth.tenant_id,requestedAgentKey,actionKey);
  const canonicalGrant=grant?{...grant,agent_key:"thebe"}:null;
  const usage=grant?await safeFirst(env,`SELECT COUNT(*) count FROM agent_action_intents
    WHERE tenant_id=? AND delegation_id=? AND created_at>=date('now') AND decision='shadow_allow'`,[auth.tenant_id,grant.id]):null;
  const approvalState=body?.humanConfirmed===true?"approved":"none";
  const decision=evaluateDelegatedAuthority({
    agentKey,
    actionKey,
    actionDefinition:definition,
    delegation:canonicalGrant,
    mode:"shadow",
    globalExecutionEnabled:false,
    amountMinor,
    dailyActionCount:Number(usage?.count||0),
    strongAuth:strongAuthPresent(),
    approvalState
  });
  const intentId=id(),status=actionStatus(decision.decision);
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO agent_action_intents(id,tenant_id,run_id,proposal_id,agent_key,action_key,requested_by_user_id,delegation_id,mode,decision,decision_code,
        required_autonomy_level,amount_minor,payload_hash,idempotency_key,status)
        VALUES(?,?,?,?,?,?,?,?, 'shadow',?,?,?,?,?,?,?)`).bind(
          intentId,auth.tenant_id,runId,proposalId,agentKey,actionKey,auth.user_id,grant?.id||null,
          decision.decision,decision.code,decision.requiredAutonomyLevel,amountMinor,payloadHash,idem,status
        ),
      ...(grant?[env.DB.prepare(`INSERT INTO agent_delegation_events(id,tenant_id,delegation_id,event_type,actor_user_id,detail_json)
        VALUES(?,?,?,'SHADOW_EVALUATED',?,?)`).bind(id(),auth.tenant_id,grant.id,auth.user_id,JSON.stringify({intentId,actionKey,decision:decision.decision,code:decision.code}))]:[])
    ]);
  }catch{
    const replay=await safeFirst(env,`SELECT id,decision,decision_code,status,payload_hash,created_at FROM agent_action_intents WHERE tenant_id=? AND idempotency_key=? LIMIT 1`,[auth.tenant_id,idem]);
    if(replay){
      if(String(replay.payload_hash||"")!==payloadHash)return json({error:"idempotency_key_conflict"},409);
      const {payload_hash,...intent}=replay;
      return json({ok:true,replayed:true,intent,execution:{performed:false,enabled:false}},200);
    }
    return json({error:"shadow_intent_create_failed"},500);
  }
  return json({ok:true,replayed:false,intent:{id:intentId,status,agentKey,actionKey,amountMinor,payloadHash},decision,execution:{performed:false,enabled:false,shadowOnly:true}},201);
}

export async function handleAgenticAuthorityRequest({request,logicalPath,env}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic/authority"))return null;
  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager","reviewer"))return json({error:"forbidden"},403);
  if(request.method!=="GET"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_failed"},403);
  }
  if(path==="/api/agentic/authority/status"&&request.method==="GET")return status(env,auth);
  if(path==="/api/agentic/authority/delegations"&&request.method==="GET"){
    if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
    return listDelegations(env,auth);
  }
  if(path==="/api/agentic/authority/delegations"&&request.method==="POST")return createDelegation({request,env,auth});
  if(path==="/api/agentic/authority/shadow"&&request.method==="POST")return shadowEvaluate({request,env,auth});
  const mutation=path.match(/^\/api\/agentic\/authority\/delegations\/([^/]+)\/(pause|revoke)$/);
  if(mutation&&request.method==="POST")return mutateDelegation({env,auth,delegationId:mutation[1],command:mutation[2]});
  return json({error:"not_found"},404);
}

export const __agenticAuthorityTest=Object.freeze({
  validIso,
  boundedInt,
  actionStatus,
  strongAuthPresent
});

export {
  authenticate,
  roleAllowed,
  originAllowed,
  csrfAllowed,
  readJson,
  requestBodyErrorStatus,
  safeAll,
  safeFirst,
  validIso,
  boundedInt,
  strongAuthPresent
};
