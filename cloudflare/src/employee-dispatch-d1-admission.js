import {APPROVED_EMPLOYEE_PROVENANCE_SQL} from './employee-proposal-review-d1-store.js';

// Experimental nonexecuting writer. Not routed, not deployed, not a task executor.
export function createEmployeeDispatchD1Admission(db){
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')throw new TypeError('atomic_d1_required');
 return {
  async admit({tenantId,proposalKey,dispatchId,idempotencyKey,actorId,action,featureEnabled=false,killSwitch=true,auditAvailable=false}={}){
   if(featureEnabled!==true||killSwitch!==false||auditAvailable!==true)return {ok:false,reason:'governance_unavailable'};
   const scoped=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(x);
   const opaque=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{16,128}$/.test(x);
   if(!scoped(tenantId)||!scoped(actorId)||!opaque(dispatchId)||!opaque(idempotencyKey)||
      typeof proposalKey!=='string'||proposalKey.length<1||proposalKey.length>2048||
      !['internal.task.create','internal.report.draft'].includes(action))return {ok:false,reason:'invalid_input'};
   // The canonical approval predicate is evaluated at write time in the batch.
   // No direct runtime effects or leases are possible through this adapter.
   const insert=db.prepare(`INSERT INTO employee_dispatch_d1_intents
    (tenant_id,dispatch_id,proposal_key,proposal_revision,workflow_revision,idempotency_key,action)
    SELECT ?,?,p.proposal_key,p.proposal_revision,p.workflow_revision,?,?
    FROM (${APPROVED_EMPLOYEE_PROVENANCE_SQL}) p
    WHERE p.proposal_revision=json_extract(p.proposal_key,'$[8]')
      AND p.workflow_revision=json_extract(p.proposal_key,'$[4]')
      AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=? AND m.user_id=?
       AND m.status='active' AND m.role='owner')
    LIMIT 1`).bind(tenantId,dispatchId,idempotencyKey,action,tenantId,proposalKey,tenantId,actorId);
   // The audit trigger rejects a missing tenant/intent pair, aborting the batch.
   const audit=db.prepare(`INSERT INTO employee_dispatch_d1_audit
    (tenant_id,dispatch_id,event_type,actor_id)
    VALUES (?,?,'employee.dispatch.admitted',?)`).bind(tenantId,dispatchId,actorId);
   try{
    const rows=await db.batch([insert,audit]);
    if(!Array.isArray(rows)||rows.length!==2||rows.some(x=>x?.success!==true)||
       Number(rows[0].meta?.changes)!==1||Number(rows[1].meta?.changes)!==1)throw new Error('atomic_result_unconfirmed');
    return {ok:true,dispatchId,executed:0};
   }catch{return {ok:false,reason:'admission_denied_or_storage_unavailable'};}
  }
 };
}
