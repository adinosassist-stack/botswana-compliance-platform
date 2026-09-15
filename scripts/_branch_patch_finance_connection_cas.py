from pathlib import Path

path=Path('cloudflare/src/finance-core.js')
s=path.read_text()

def replace_once(old,new,label):
    global s
    count=s.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    s=s.replace(old,new,1)

append_anchor='''async function financeSummary(env,tenantId){'''
append_guard='''async function appendLineageIfEntityUnchanged({env,tenantId,userId,eventType,entityType,entityId,payload,expectedEntitySequence,sha256Hex,id}){
  for(let attempt=0;attempt<3;attempt++){
    const prior=await env.DB.prepare("SELECT sequence,event_hash FROM finance_lineage WHERE tenant_id=? ORDER BY sequence DESC LIMIT 1").bind(tenantId).first();
    const sequence=Number(prior?.sequence||0)+1,previousHash=String(prior?.event_hash||"GENESIS");
    const canonical=JSON.stringify({tenantId,sequence,eventType,entityType,entityId,payload,previousHash});
    const eventHash=await sha256Hex(canonical);
    try{
      const result=await env.DB.prepare(`INSERT INTO finance_lineage(id,tenant_id,sequence,event_type,entity_type,entity_id,payload_json,previous_hash,event_hash,actor_user_id)
        SELECT ?,?,?,?,?,?,?,?,?,?
        WHERE COALESCE((SELECT MAX(sequence) FROM finance_lineage WHERE tenant_id=? AND entity_type=? AND entity_id=? AND event_type IN ('CONNECTION_REGISTERED','CONNECTION_STATUS_CHANGED','CONNECTION_SYNC_COMPLETED')),0)=?`)
        .bind(id(),tenantId,sequence,eventType,entityType,entityId,JSON.stringify(payload),previousHash,eventHash,userId,tenantId,entityType,entityId,Number(expectedEntitySequence||0)).run();
      const changes=Number(result?.meta?.changes??result?.changes??0);
      if(changes===1)return {sequence,eventHash};
      return null;
    }catch(error){if(!/unique|constraint/i.test(String(error)))throw error}
  }
  throw new Error("finance_lineage_contention");
}

async function financeSummary(env,tenantId){'''
replace_once(append_anchor,append_guard,'guarded append insertion')

old='''    await appendLineage({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CONNECTION_STATUS_CHANGED",entityType:"finance_connection",entityId:connection.id,payload:{providerKey:connection.providerKey,previousStatus:connection.status,status:nextStatus,readOnly:true},sha256Hex,id});
    const resolved=await getFinanceConnection(env,auth.tenant_id,connection.id);
    if(!resolved||resolved.status!==nextStatus)return json({error:"finance_connection_state_conflict",status:resolved?.status||connection.status},409);
'''
new='''    const appended=await appendLineageIfEntityUnchanged({env,tenantId:auth.tenant_id,userId:auth.user_id,eventType:"CONNECTION_STATUS_CHANGED",entityType:"finance_connection",entityId:connection.id,payload:{providerKey:connection.providerKey,previousStatus:connection.status,status:nextStatus,readOnly:true},expectedEntitySequence:connection.lastSequence,sha256Hex,id});
    if(!appended){
      const resolved=await getFinanceConnection(env,auth.tenant_id,connection.id);
      if(resolved?.status===nextStatus)return json({ok:true,id:connection.id,status:nextStatus,providerKey:connection.providerKey,readOnly:true,replayed:true});
      return json({error:"finance_connection_state_conflict",status:resolved?.status||connection.status},409);
    }
    const resolved=await getFinanceConnection(env,auth.tenant_id,connection.id);
    if(!resolved||resolved.status!==nextStatus)return json({error:"finance_connection_state_conflict",status:resolved?.status||connection.status},409);
'''
replace_once(old,new,'connection transition CAS')

path.write_text(s)
print('patched finance connection transition CAS')
