export const AGENT_CAPABILITY_SECURITY_VERSION="2026-09-27.v1";

const frozen=value=>Object.freeze(value);
const clean=(value,max=240)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const MAX_TTL_SECONDS=300;

function bytes(value){return new TextEncoder().encode(String(value??""))}
function base64url(input){
  const data=input instanceof Uint8Array?input:bytes(input);
  let binary="";
  for(const value of data)binary+=String.fromCharCode(value);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromBase64url(value){
  const normalized=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
  const padded=normalized+"=".repeat((4-normalized.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
async function hmac(secret,value){
  const key=await crypto.subtle.importKey("raw",bytes(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,bytes(value)));
}
function safeEqual(a,b){
  const left=fromBase64url(a),right=fromBase64url(b);
  if(left.length!==right.length)return false;
  let diff=0;
  for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
  return diff===0;
}

export function evaluateToolDataBoundary({
  tool,destination="internal",payloadDataClasses=[],payloadBytes=0
}={}){
  if(!tool||tool.trustState!=="trusted")return frozen({allowed:false,code:"tool_not_trusted"});
  const policy=tool.egressPolicy;
  if(!policy)return frozen({allowed:false,code:"egress_policy_missing"});
  const target=clean(destination,240)||"internal";
  const destinations=Array.isArray(policy.allowedDestinations)?policy.allowedDestinations:[];
  if(!destinations.includes(target))return frozen({allowed:false,code:"egress_destination_forbidden"});
  const requested=[...new Set((Array.isArray(payloadDataClasses)?payloadDataClasses:[]).map(value=>clean(value,80)).filter(Boolean))];
  const allowedClasses=new Set(Array.isArray(policy.allowedDataClasses)?policy.allowedDataClasses:[]);
  if(requested.some(value=>!allowedClasses.has(value)))return frozen({allowed:false,code:"egress_data_class_forbidden"});
  const size=Number(payloadBytes||0);
  if(!Number.isFinite(size)||size<0||size>Number(policy.maxPayloadBytes||0))return frozen({allowed:false,code:"egress_payload_too_large"});
  return frozen({
    allowed:true,
    code:"egress_policy_pass",
    destination:target,
    dataClasses:frozen(requested),
    credentialRequired:policy.credentialRequired===true,
    networkMode:policy.networkMode||"deny_by_default"
  });
}

export async function issueToolCapabilityCredential({
  secret,tenantId,agentId="THEBE-001",actionKey,toolId,executionEnvId,ttlSeconds=120,now=Date.now(),nonce=crypto.randomUUID()
}={}){
  if(!clean(secret,4096))throw new Error("capability_secret_required");
  const tenant=clean(tenantId,120),action=clean(actionKey,120),tool=clean(toolId,160),environment=clean(executionEnvId,160);
  if(!tenant||!action||!tool||!environment)throw new Error("capability_scope_required");
  const ttl=Math.min(MAX_TTL_SECONDS,Math.max(1,Math.floor(Number(ttlSeconds)||120)));
  const issuedAt=Math.floor(Number(now)/1000),expiresAt=issuedAt+ttl;
  const payload=frozen({
    v:AGENT_CAPABILITY_SECURITY_VERSION,
    jti:clean(nonce,160),
    tenantId:tenant,
    agentId:clean(agentId,120),
    actionKey:action,
    toolId:tool,
    executionEnvId:environment,
    issuedAt,
    expiresAt,
    nonInheritable:true,
    reusable:false
  });
  const encoded=base64url(JSON.stringify(payload));
  const signature=base64url(await hmac(secret,encoded));
  return frozen({token:`${encoded}.${signature}`,payload});
}

export async function verifyToolCapabilityCredential({
  secret,token,tenantId,agentId="THEBE-001",actionKey,toolId,executionEnvId,now=Date.now()
}={}){
  if(!clean(secret,4096))return frozen({valid:false,code:"capability_secret_required"});
  const parts=String(token||"").split(".");
  if(parts.length!==2)return frozen({valid:false,code:"capability_token_invalid"});
  const expected=base64url(await hmac(secret,parts[0]));
  if(!safeEqual(parts[1],expected))return frozen({valid:false,code:"capability_signature_invalid"});
  let payload;
  try{payload=JSON.parse(new TextDecoder().decode(fromBase64url(parts[0])))}catch{return frozen({valid:false,code:"capability_payload_invalid"})}
  const nowSeconds=Math.floor(Number(now)/1000);
  if(payload.v!==AGENT_CAPABILITY_SECURITY_VERSION||payload.nonInheritable!==true||payload.reusable!==false)return frozen({valid:false,code:"capability_contract_invalid"});
  if(nowSeconds<payload.issuedAt-30||nowSeconds>=payload.expiresAt)return frozen({valid:false,code:"capability_expired"});
  const expectedScope={
    tenantId:clean(tenantId,120),agentId:clean(agentId,120),actionKey:clean(actionKey,120),
    toolId:clean(toolId,160),executionEnvId:clean(executionEnvId,160)
  };
  if(Object.entries(expectedScope).some(([key,value])=>!value||payload[key]!==value))return frozen({valid:false,code:"capability_scope_mismatch"});
  return frozen({valid:true,code:"capability_valid",payload:frozen(payload)});
}

export function createEphemeralExecutionContext({tenantId,runId,executionEnvId=crypto.randomUUID()}={}){
  const tenant=clean(tenantId,120),run=clean(runId,120),environment=clean(executionEnvId,160);
  if(!tenant||!run||!environment)throw new Error("execution_context_scope_required");
  return frozen({
    executionEnvId:environment,
    tenantId:tenant,
    runId:run,
    persistence:"ephemeral",
    inheritProcessEnvironment:false,
    inheritCredentials:false,
    inheritBrowserSession:false,
    filesystem:"isolated_ephemeral",
    network:"deny_by_default",
    destroyAfterRun:true,
    recoverySource:"verified_checkpoint_only"
  });
}

export const __agentCapabilitySecurityTest=frozen({MAX_TTL_SECONDS,base64url,fromBase64url,safeEqual});
