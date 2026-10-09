export const AGENT_RUNTIME_CONTAINMENT_VERSION="2026-10-09.v1";

const MAX_TENANT_CONTROLS=500;
const MAX_TENANT_ID_LENGTH=120;
const frozen=value=>Object.freeze(value);
const envTrue=value=>["1","true","on","yes"].includes(String(value??"").trim().toLowerCase());
const tenantIdValid=value=>{
  const tenant=String(value??"").trim();
  return tenant.length>0&&tenant.length<=MAX_TENANT_ID_LENGTH&&!/[\s,\u0000-\u001f\u007f]/.test(tenant);
};

export function parseTenantControlList(raw){
  const source=String(raw??"").trim();
  if(!source)return frozen({ok:true,values:frozen([])});
  const parts=source.split(",").map(value=>value.trim());
  if(parts.length>MAX_TENANT_CONTROLS||parts.some(value=>!tenantIdValid(value))){
    return frozen({ok:false,values:frozen([]),code:"tenant_control_config_invalid"});
  }
  return frozen({ok:true,values:frozen([...new Set(parts)])});
}

function decision(allowed,code,{tenantId=null,authorityState=null}={}){
  return frozen({
    allowed,
    executionAllowed:allowed,
    code,
    version:AGENT_RUNTIME_CONTAINMENT_VERSION,
    tenantId:tenantId?String(tenantId):null,
    authorityState:authorityState?String(authorityState):null
  });
}

export function evaluateAgentRuntimeContainment({
  tenantId,
  agentAuthority,
  runtimeEnabled=true,
  globalKillSwitch=false,
  suspendedTenantsRaw="",
  quarantinedTenantsRaw=""
}={}){
  const tenant=String(tenantId??"").trim();
  if(!tenantIdValid(tenant))return decision(false,"tenant_scope_required");
  if(runtimeEnabled!==true)return decision(false,"agent_runtime_disabled",{tenantId:tenant});
  if(globalKillSwitch===true)return decision(false,"runtime_kill_switch_active",{tenantId:tenant});

  if(agentAuthority?.ready!==true){
    return decision(false,"agent_authority_unavailable",{tenantId:tenant,authorityState:agentAuthority?.state||"restricted"});
  }
  const authorityState=String(agentAuthority?.state||"").trim().toLowerCase();
  if(authorityState!=="active"||agentAuthority?.executionCapable!==true){
    const code=["restricted","suspended","revoked"].includes(authorityState)
      ?`agent_authority_${authorityState}`
      :"agent_authority_invalid";
    return decision(false,code,{tenantId:tenant,authorityState:authorityState||"invalid"});
  }

  const suspended=parseTenantControlList(suspendedTenantsRaw);
  const quarantined=parseTenantControlList(quarantinedTenantsRaw);
  if(!suspended.ok||!quarantined.ok){
    return decision(false,"tenant_control_config_invalid",{tenantId:tenant,authorityState});
  }
  if(quarantined.values.includes(tenant))return decision(false,"tenant_quarantined",{tenantId:tenant,authorityState});
  if(suspended.values.includes(tenant))return decision(false,"tenant_suspended",{tenantId:tenant,authorityState});
  return decision(true,"runtime_containment_clear",{tenantId:tenant,authorityState});
}

export function tenantContainmentFromEnv(env,tenantId,agentAuthority){
  return evaluateAgentRuntimeContainment({
    tenantId,
    agentAuthority,
    runtimeEnabled:String(env?.AGENT_RUNTIME_ENABLED??"1").trim()!=="0",
    globalKillSwitch:envTrue(env?.AGENT_RUNTIME_KILL_SWITCH),
    suspendedTenantsRaw:env?.AGENT_RUNTIME_SUSPENDED_TENANTS??"",
    quarantinedTenantsRaw:env?.AGENT_RUNTIME_QUARANTINED_TENANTS??""
  });
}

export const __agentRuntimeContainmentTest=frozen({
  MAX_TENANT_CONTROLS,MAX_TENANT_ID_LENGTH,envTrue,tenantIdValid
});
