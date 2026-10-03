export const AUDIT_LINEAGE_WRITER_VERSION="2026-10-03.v272";

const encoder=new TextEncoder();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const newId=()=>crypto.randomUUID();

function stableJsonValue(value){
  if(value===null||typeof value!=="object")return value;
  if(Array.isArray(value))return value.map(stableJsonValue);
  const out={};
  for(const key of Object.keys(value).sort())out[key]=stableJsonValue(value[key]);
  return out;
}

export function stableAuditJson(value){
  return JSON.stringify(stableJsonValue(value));
}

async function hmacHex(secret,value){
  const key=await crypto.subtle.importKey("raw",encoder.encode(String(secret)),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,encoder.encode(String(value)));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

export async function appendSealedAuditEvent(env,{
  tenantId,
  actorUserId=null,
  eventType,
  entityType="system",
  entityId=null,
  eventData={},
  writeSource="server"
}={}){
  if(!env?.DB)throw new Error("audit_database_unavailable");
  if(!tenantId||!eventType)throw new Error("audit_identity_required");
  if(!env?.AUDIT_INTEGRITY_SECRET)throw new Error("audit_integrity_secret_not_configured");

  const occurredAt=new Date().toISOString();
  for(let attempt=0;attempt<5;attempt++){
    try{
      const state=await env.DB.prepare("SELECT last_hash,event_count FROM audit_chain_state WHERE tenant_id=? LIMIT 1")
        .bind(tenantId).first();
      const seq=Number(state?.event_count||0)+1;
      const prevHash=state?.last_hash||"GENESIS";
      const normalized=stableAuditJson(eventData||{});
      const hashInput=stableAuditJson({
        tenantId,
        seq,
        actorUserId,
        eventType,
        entityType,
        entityId,
        eventData:JSON.parse(normalized),
        occurredAt,
        prevHash,
        integrityVersion:1
      });
      const eventHash=await hmacHex(env.AUDIT_INTEGRITY_SECRET,hashInput);
      const insert=env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data,occurred_at,tenant_seq,prev_hash,event_hash,integrity_version,write_source)
        VALUES(?,?,?,?,?,?,?,?,?,?,1,?)`).bind(
          tenantId,
          actorUserId,
          eventType,
          entityType,
          entityId,
          normalized,
          occurredAt,
          seq,
          prevHash,
          eventHash,
          writeSource
        );
      const update=env.DB.prepare(`INSERT INTO audit_chain_state(tenant_id,last_event_id,last_hash,event_count,updated_at)
        VALUES(?,NULL,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id) DO UPDATE SET last_event_id=NULL,last_hash=excluded.last_hash,event_count=excluded.event_count,updated_at=CURRENT_TIMESTAMP`)
        .bind(tenantId,eventHash,seq);
      await env.DB.batch([insert,update]);
      return Object.freeze({ok:true,seq,eventHash,prevHash});
    }catch(error){
      if(attempt===4){
        try{
          await env.DB.prepare("INSERT INTO audit_write_failures(id,tenant_id,actor_user_id,event_type,error_message,event_data) VALUES(?,?,?,?,?,?)")
            .bind(newId(),tenantId,actorUserId,eventType,String(error).slice(0,500),stableAuditJson(eventData||{})).run();
        }catch{}
        throw new Error("audit_write_failed");
      }
      await delay(5*(attempt+1));
    }
  }
  throw new Error("audit_write_failed");
}

export const __auditLineageWriterTest=Object.freeze({stableJsonValue,hmacHex});
