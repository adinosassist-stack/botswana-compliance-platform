import { createEmployeeDispatchPostgresTransactionStore } from "./employee-dispatch-postgres-transaction.js";

// Development-only stop writer. Never registers a route or enables execution.
// The resolver is a trusted server middleware seam, never request JSON.
const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(x);
const revision=x=>{
  const value=typeof x==="number"&&Number.isSafeInteger(x)?String(x):x;
  return typeof value==="string"&&/^[1-9]\d{0,18}$/.test(value)&&
    BigInt(value)<9223372036854775807n?value:null;
};
const denied=reason=>({ok:false,reason});

export function createEmployeeWorkerOwnerStopDraft({pool,resolveAuthenticatedSession,
  draftOnly=false,stopWritingEnabled=false}={}){
  if(!pool||typeof pool.connect!=="function"||typeof resolveAuthenticatedSession!=="function"){
    throw new TypeError("invalid_owner_stop_dependencies");
  }
  const store=createEmployeeDispatchPostgresTransactionStore(pool,client=>({
    async stop(tenantId,sessionId,expectedRevision){
      // Same lock order as the worker: controls, then canonical authority.
      const state=await client.query(
        `select revision,feature_enabled,kill_switch,operator_stop
         from employee_dispatch_worker_controls where tenant_id=$1 for update`,[tenantId]);
      const auth=await client.query(
        `select s.user_id::text as actor_id from sessions s
         join users u on u.id=s.user_id
         join memberships m on m.tenant_id=s.tenant_id and m.user_id=s.user_id
         where s.id=$1::uuid and s.tenant_id=$2::uuid
           and s.revoked_at is null and s.expires_at>clock_timestamp()
           and s.session_generation=u.session_generation
           and m.status='active' and m.role='owner'
         for share of s,u,m`,[sessionId,tenantId]);
      if(auth.rowCount!==1||!uuid(auth.rows?.[0]?.actor_id))return denied("forbidden");
      if(state.rowCount!==1)return denied("controls_unavailable");
      const current=state.rows[0];
      if(String(current.revision)!==expectedRevision)return denied("revision_conflict");
      if(current.feature_enabled===false&&current.kill_switch===true&&current.operator_stop===true){
        return {ok:true,stopped:true,changed:false,reason:"already_stopped",revision:expectedRevision};
      }
      const update=await client.query(
        `update employee_dispatch_worker_controls
         set feature_enabled=false,kill_switch=true,operator_stop=true
         where tenant_id=$1 and revision=$2::bigint
           and exists (select 1 from sessions s where s.id=$3::uuid
             and s.tenant_id::text=$1 and s.revoked_at is null
             and s.expires_at>clock_timestamp())
         returning revision`,[tenantId,expectedRevision,sessionId]);
      if(update.rowCount!==1)return denied("forbidden");
      const next=String(update.rows[0].revision);
      const audit=await client.query(
        `insert into employee_dispatch_worker_owner_stops
           (tenant_id,revision,actor_user_id,session_id)
         values ($1,$2::bigint,$3::uuid,$4::uuid) returning revision`,
        [tenantId,next,auth.rows[0].actor_id,sessionId]);
      if(audit.rowCount!==1||String(audit.rows?.[0]?.revision)!==next){
        throw new Error("owner_stop_audit_unconfirmed");
      }
      return {ok:true,stopped:true,changed:true,reason:"worker_stopped",revision:next};
    }
  }));
  return Object.freeze({
    async stopWorker({context,expectedRevision}={}){
      if(draftOnly!==true||stopWritingEnabled!==true)return denied("not_enabled");
      const expected=revision(expectedRevision);
      if(!expected)return denied("invalid_request");
      try{
        const session=await resolveAuthenticatedSession(context);
        if(!uuid(session?.id)||!uuid(session?.tenantId))return denied("unauthenticated");
        return await store.transaction(tx=>tx.stop(session.tenantId,session.id,expected));
      }catch{return denied("governance_unavailable");}
    }
  });
}
