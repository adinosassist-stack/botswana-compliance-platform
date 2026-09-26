export const AGENT_CONTROL_PLANE_VERSION="2026-09-26.v1";
export const THEBE_AGENT_ID="THEBE-001";
export const FINANCE_OBSERVER_AGENT_ID="SYS-FIN-OBS-001";

const VALID_STATES=new Set(["active","restricted","suspended","revoked"]);
const VALID_ACTORS=new Set(["platform_admin","system"]);
const frozen=value=>Object.freeze(value);
const clean=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const EXPECTED=Object.freeze({
  [THEBE_AGENT_ID]:Object.freeze({
    agentId:THEBE_AGENT_ID,canonicalName:"thebe",actorType:"agent",
    purpose:"Canonical Thebe Super Agent",riskTier:"high",ownerScope:"platform",executionCapable:true
  }),
  [FINANCE_OBSERVER_AGENT_ID]:Object.freeze({
    agentId:FINANCE_OBSERVER_AGENT_ID,canonicalName:"system_observer",actorType:"system_observer",
    purpose:"Governed read-only Finance observation",riskTier:"low",ownerScope:"platform",executionCapable:false
  })
});

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function publicAuthority(row,agentId){
  if(!row)return frozen({
    ready:false,agentId,state:"restricted",executionCapable:false,
    reason:"agent_identity_missing"
  });
  const state=clean(row.authority_state,24).toLowerCase();
  return frozen({
    ready:true,
    agentId:clean(row.agent_id,120),
    canonicalName:clean(row.canonical_name,120),
    actorType:clean(row.actor_type,40),
    purpose:clean(row.purpose,240),
    riskTier:clean(row.risk_tier,24),
    ownerScope:clean(row.owner_scope,40),
    state:VALID_STATES.has(state)?state:"restricted",
    executionCapable:Number(row.execution_capable)===1,
    reason:state==="active"?"agent_authority_active":
      state==="restricted"?"agent_authority_restricted":
      state==="suspended"?"agent_authority_suspended":
      state==="revoked"?"agent_authority_revoked":"agent_authority_invalid"
  });
}

export async function loadCanonicalAgentAuthority(env,agentId=THEBE_AGENT_ID){
  const normalized=clean(agentId,120);
  if(!env?.DB||!normalized)return frozen({ready:false,agentId:normalized||THEBE_AGENT_ID,state:"restricted",executionCapable:false,reason:"agent_registry_unavailable"});
  try{
    const row=await env.DB.prepare(`SELECT agent_id,canonical_name,actor_type,purpose,risk_tier,authority_state,execution_capable,owner_scope
      FROM agent_registry WHERE agent_id=? LIMIT 1`).bind(normalized).first();
    return publicAuthority(row,normalized);
  }catch{
    return frozen({ready:false,agentId:normalized,state:"restricted",executionCapable:false,reason:"agent_registry_unavailable"});
  }
}

export function authorityPermitsExecution(authority){
  return authority?.ready===true&&authority.agentId===THEBE_AGENT_ID&&authority.actorType==="agent"&&authority.state==="active"&&authority.executionCapable===true;
}

function expectedDescriptor(expected){
  return {
    agentId:expected.agentId,
    canonicalName:expected.canonicalName,
    actorType:expected.actorType,
    purpose:expected.purpose,
    riskTier:expected.riskTier,
    ownerScope:expected.ownerScope,
    executionCapable:expected.executionCapable
  };
}
function effectiveDescriptor(authority){
  if(!authority?.ready)return {missing:true,agentId:authority?.agentId||null};
  return {
    agentId:authority.agentId,
    canonicalName:authority.canonicalName,
    actorType:authority.actorType,
    purpose:authority.purpose,
    riskTier:authority.riskTier,
    ownerScope:authority.ownerScope,
    executionCapable:authority.executionCapable
  };
}

export async function evaluateCanonicalAgentDrift(env,{persist=false}={}){
  if(!env?.DB)return frozen({ok:false,code:"agent_registry_unavailable",findings:frozen([])});
  const findings=[];
  for(const expected of Object.values(EXPECTED)){
    const authority=await loadCanonicalAgentAuthority(env,expected.agentId);
    const expectedValue=expectedDescriptor(expected),effectiveValue=effectiveDescriptor(authority);
    const expectedHash=await sha256Hex(JSON.stringify(expectedValue));
    const effectiveHash=await sha256Hex(JSON.stringify(effectiveValue));
    const drifted=expectedHash!==effectiveHash;
    if(drifted){
      const finding=frozen({agentId:expected.agentId,findingType:"canonical_identity_drift",expectedHash,effectiveHash,expected:expectedValue,effective:effectiveValue});
      findings.push(finding);
      if(persist){
        const current=await env.DB.prepare("SELECT id FROM agent_authority_drift_findings WHERE agent_id=? AND finding_type='canonical_identity_drift' AND status='open' LIMIT 1").bind(expected.agentId).first();
        if(current?.id){
          await env.DB.prepare("UPDATE agent_authority_drift_findings SET effective_hash=?,detail_json=?,detected_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'")
            .bind(effectiveHash,JSON.stringify({expected:expectedValue,effective:effectiveValue}),current.id).run();
        }else{
          await env.DB.prepare(`INSERT OR IGNORE INTO agent_authority_drift_findings(
            id,agent_id,finding_type,expected_hash,effective_hash,detail_json,status
          ) VALUES(?,?,'canonical_identity_drift',?,?,?,'open')`)
            .bind(crypto.randomUUID(),expected.agentId,expectedHash,effectiveHash,JSON.stringify({expected:expectedValue,effective:effectiveValue})).run();
        }
      }
    }else if(persist){
      await env.DB.prepare("UPDATE agent_authority_drift_findings SET status='resolved',resolved_at=CURRENT_TIMESTAMP WHERE agent_id=? AND finding_type='canonical_identity_drift' AND status='open'")
        .bind(expected.agentId).run();
    }
  }
  return frozen({ok:true,drifted:findings.length>0,findings:frozen(findings)});
}

export async function transitionCanonicalAgentAuthority({
  env,agentId=THEBE_AGENT_ID,newState,reasonCode,actorType="platform_admin",actorId=null,auditTenantId=null
}={}){
  const target=clean(agentId,120),state=clean(newState,24).toLowerCase(),reason=clean(reasonCode,120),actor=clean(actorType,40),principal=clean(actorId,160)||null;
  if(!env?.DB)return frozen({ok:false,code:"agent_registry_unavailable"});
  if(!target||!VALID_STATES.has(state))return frozen({ok:false,code:"invalid_authority_state"});
  if(!reason)return frozen({ok:false,code:"authority_reason_required"});
  if(!VALID_ACTORS.has(actor))return frozen({ok:false,code:"invalid_authority_actor"});

  const current=await loadCanonicalAgentAuthority(env,target);
  if(!current.ready)return frozen({ok:false,code:current.reason||"agent_identity_missing",authority:current});
  if(current.state===state)return frozen({ok:true,replayed:true,authority:current,evidenceHash:null});
  if(current.state==="revoked")return frozen({ok:false,code:"agent_authority_revoked_terminal",authority:current});

  const eventId=crypto.randomUUID();
  const evidenceHash=await sha256Hex(JSON.stringify({
    agentId:target,previousState:current.state,newState:state,reasonCode:reason,actorType:actor,actorId:principal
  }));
  const statements=[
    env.DB.prepare(`UPDATE agent_registry SET authority_state=?,updated_at=CURRENT_TIMESTAMP,last_authority_change_at=CURRENT_TIMESTAMP
      WHERE agent_id=? AND authority_state=? AND authority_state<>'revoked'`).bind(state,target,current.state),
    env.DB.prepare(`INSERT INTO agent_authority_events(id,agent_id,previous_state,new_state,reason_code,actor_type,actor_id,evidence_hash)
      SELECT ?,?,?,?,?,?,?,? WHERE changes()=1`).bind(eventId,target,current.state,state,reason,actor,principal,evidenceHash)
  ];
  const tenant=clean(auditTenantId,120);
  if(tenant){
    statements.push(
      env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
        SELECT ?,?,'AGENT_AUTHORITY_STATE_CHANGED','agent_registry',?,? WHERE changes()=1`)
        .bind(tenant,principal,target,JSON.stringify({previousState:current.state,newState:state,reasonCode:reason,evidenceHash,controlPlaneVersion:AGENT_CONTROL_PLANE_VERSION}))
    );
  }
  let results;
  try{results=await env.DB.batch(statements)}
  catch(error){
    return frozen({ok:false,code:"agent_authority_transition_failed",error:clean(error?.message||error,160)});
  }
  const changed=Number(results?.[0]?.meta?.changes??results?.[0]?.changes??0);
  if(changed!==1)return frozen({ok:false,code:"agent_authority_transition_conflict"});
  const authority=await loadCanonicalAgentAuthority(env,target);
  return frozen({ok:true,replayed:false,authority,evidenceHash,eventId});
}

export const __agentControlPlaneTest=Object.freeze({EXPECTED,VALID_STATES,VALID_ACTORS,publicAuthority});
