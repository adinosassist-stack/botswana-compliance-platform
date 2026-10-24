import { randomUUID } from "node:crypto";
import { createEmployeeDispatchPostgresTransactionStore } from "./employee-dispatch-postgres-transaction.js";

/**
 * DEVELOPMENT-ONLY LEASE SIMULATOR. No worker startup, task/report execution,
 * external I/O, HTTP route or production database migration.
 * "qualified" = simulated preflight, NEVER an executed action.
 */
const validTenant = x => typeof x === "string" && /^[a-zA-Z0-9_:.-]{1,200}$/.test(x);
const validUuid = x => typeof x === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(x);
const admitted = config => config?.featureEnabled === true &&
  config?.killSwitch === false && config?.auditAvailable === true &&
  config?.operatorStop === false && config?.simulationOnly === true;
const fail = reason => ({ ok:false, reason });

export function createEmployeeDispatchWorkerRecoveryDraft(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("invalid_employee_worker_pool");
  }
  const store = createEmployeeDispatchPostgresTransactionStore(pool, client => {
    async function durableControls(tenantId) {
      // Hold the shared row lock until lease state and audit COMMIT together.
      // A stop writer waits for in-flight transactions; after it commits,
      // every instance must observe the stopped state before doing any work.
      const result=await client.query(
        `select feature_enabled,kill_switch,operator_stop
         from employee_dispatch_worker_controls where tenant_id=$1
         for share`,[tenantId]
      );
      const controls=result.rows?.[0];
      return result.rowCount===1 && controls?.feature_enabled===true &&
        controls?.kill_switch===false && controls?.operator_stop===false;
    }
    async function currentApproval(tenantId,intentId) {
      const check = await client.query(
        `select 1 from employee_dispatch_intents i
         join employee_dispatch_proposal_heads h
           on h.tenant_id=i.tenant_id and h.proposal_id=i.proposal_id
         join employee_dispatch_proposal_versions v
           on v.tenant_id=h.tenant_id and v.proposal_id=h.proposal_id
          and v.revision=h.current_revision
         join employee_dispatch_proposal_reviews r
           on r.tenant_id=i.tenant_id and r.review_id=i.review_id
          and r.proposal_id=h.proposal_id
         join employee_dispatch_review_session_provenance p
           on p.tenant_id=r.tenant_id and p.review_id=r.review_id
         join sessions s on s.id=p.session_id
         join users u on u.id=s.user_id
         join memberships m
           on m.tenant_id=s.tenant_id and m.user_id=s.user_id
         join employee_dispatch_reviewer_permission_grants g
           on g.tenant_id=m.tenant_id and g.reviewer_user_id=m.user_id
         join memberships issuer
           on issuer.tenant_id=g.tenant_id and issuer.user_id=g.granted_by_user_id
         where i.tenant_id=$1 and i.id=$2::uuid
           and h.revoked=false and r.decision='approved'
           and r.proposal_revision=h.current_revision
           and r.review_sequence=h.last_review_sequence
           and r.reviewer_id=p.reviewer_user_id::text
           and r.reviewer_id=m.user_id::text
           and r.reviewer_id<>v.author_id and i.action=v.action
           and s.tenant_id::text=i.tenant_id
           and s.user_id=p.reviewer_user_id
           and s.revoked_at is null and s.expires_at>clock_timestamp()
           and s.session_generation=u.session_generation
           and m.status='active' and m.role in ('owner','manager','reviewer')
           and g.permission='people.workflow.approve'
           and g.enabled=true and g.revoked_at is null
           and issuer.status='active' and issuer.role='owner'
           and issuer.user_id<>m.user_id
           and exists (
             select 1 from employee_dispatch_admission_audit a
              where a.tenant_id=i.tenant_id and a.intent_id=i.id
                and a.created=true and a.event_type='employee.dispatch.admitted'
           )
         for share of h,g,m,issuer,s,u`,
        [tenantId,intentId]
      );
      return check.rowCount === 1;
    }
    async function event(tenantId,intentId,attempt,token,type) {
      const result=await client.query(
        `insert into employee_dispatch_worker_events
         (event_id,tenant_id,intent_id,attempt,lease_token,event_type)
         values ($1,$2,$3::uuid,$4,$5::uuid,$6) returning event_id`,
        [randomUUID(),tenantId,intentId,attempt,token,type]
      );
      if (result.rowCount!==1) throw new Error("worker_audit_unconfirmed");
    }
    async function lockLease(tenantId,intentId) {
      const r=await client.query(
        `select state,attempts,max_attempts,lease_token,
                (lease_expires_at>clock_timestamp()) as lease_live
         from employee_dispatch_worker_claims
         where tenant_id=$1 and intent_id=$2::uuid
         for update`,
        [tenantId,intentId]
      );
      return r.rowCount===1?r.rows[0]:null;
    }
    return {
      async claim(tenantId,leaseSeconds) {
        if(!(await durableControls(tenantId)))return fail("durable_controls_stopped");
        const result=await client.query(
          `select w.tenant_id,w.intent_id,w.state,w.attempts,w.max_attempts,
                  i.action,i.proposal_id
           from employee_dispatch_worker_claims w
           join employee_dispatch_intents i
             on i.tenant_id=w.tenant_id and i.id=w.intent_id
           where w.tenant_id=$1 and w.next_attempt_at<=clock_timestamp()
             and (w.state='pending' or
                  (w.state='leased' and w.lease_expires_at<=clock_timestamp()))
           order by w.next_attempt_at,w.updated_at,w.intent_id
           for update of w skip locked limit 1`,
          [tenantId]
        );
        if(result.rowCount!==1) return {ok:false,reason:"no_claim_ready"};
        const row=result.rows[0];
        if(!(await currentApproval(tenantId,row.intent_id))) {
          return {ok:false,reason:"approval_required"};
        }
        if(row.attempts>=row.max_attempts) {
          if(row.state!=="leased") throw new Error("exhausted_pending_state");
          // Prior attempt expired: permanently dead letter the intent.
          const old=await client.query(
            `select lease_token from employee_dispatch_worker_claims
             where tenant_id=$1 and intent_id=$2::uuid for update`,
            [tenantId,row.intent_id]
          );
          const token=old.rows?.[0]?.lease_token;
          if(!validUuid(token)) throw new Error("missing_expired_token");
          const changed=await client.query(
            `update employee_dispatch_worker_claims
             set state='dead_letter',lease_token=null,lease_expires_at=null,
                 updated_at=clock_timestamp()
             where tenant_id=$1 and intent_id=$2::uuid
             returning state`,[tenantId,row.intent_id]
          );
          if(changed.rowCount!==1) throw new Error("dead_letter_unconfirmed");
          await event(tenantId,row.intent_id,row.attempts,token,"dead_lettered");
          return {ok:false,reason:"dead_lettered"};
        }
        const token=randomUUID();
        const changed=await client.query(
          `update employee_dispatch_worker_claims
           set state='leased',attempts=attempts+1,lease_token=$3::uuid,
               lease_expires_at=clock_timestamp()+($4::integer*interval '1 second'),
               updated_at=clock_timestamp()
           where tenant_id=$1 and intent_id=$2::uuid
           returning attempts`,
          [tenantId,row.intent_id,token,leaseSeconds]
        );
        if(changed.rowCount!==1) throw new Error("claim_failed");
        const attempt=changed.rows[0].attempts;
        await event(tenantId,row.intent_id,attempt,token,"claimed");
        return {ok:true,reason:"lease_claimed",intentId:row.intent_id,
                leaseToken:token,attempt,action:row.action};
      },
      async finish(tenantId,intentId,leaseToken,kind,delaySeconds=0) {
        if(!(await durableControls(tenantId)))return fail("durable_controls_stopped");
        const l=await lockLease(tenantId,intentId);
        if(!l||l.state!=="leased"||l.lease_token!==leaseToken||
           l.lease_live!==true) return fail("stale_or_expired_lease");
        // Fresh authorization is required even for simulated qualification.
        if(!(await currentApproval(tenantId,intentId))) return fail("approval_required");
        let newState,type;
        if(kind==="qualify") {
          newState="qualified"; type="qualified";
        } else if(kind==="retry") {
          newState=l.attempts>=l.max_attempts?"dead_letter":"pending";
          type=newState==="dead_letter"?"dead_lettered":"retried";
        } else throw new Error("invalid_worker_transition");
        const x=await client.query(
          `update employee_dispatch_worker_claims
           set state=$4,lease_token=null,lease_expires_at=null,
               next_attempt_at=clock_timestamp()+($5::integer*interval '1 second'),
               updated_at=clock_timestamp()
           where tenant_id=$1 and intent_id=$2::uuid and lease_token=$3::uuid
             and lease_expires_at>clock_timestamp()
           returning state`,
          [tenantId,intentId,leaseToken,newState,delaySeconds]
        );
        if(x.rowCount!==1) return fail("stale_or_expired_lease");
        await event(tenantId,intentId,l.attempts,leaseToken,type);
        return {ok:true,reason:newState==="qualified"?"simulated_preflight_only":newState};
      }
    };
  });

  return {
    async claimNext({tenantId,leaseSeconds=30,...config}={}) {
      if(!validTenant(tenantId)||!Number.isInteger(leaseSeconds)||
         leaseSeconds<1||leaseSeconds>300) return fail("invalid_request");
      if(!admitted(config)) return fail("governance_unavailable");
      try{return await store.transaction(tx=>tx.claim(tenantId,leaseSeconds));}
      catch{return fail("governance_unavailable");}
    },
    async resolveLease({tenantId,intentId,leaseToken,transition,
                        retryDelaySeconds=0,...config}={}) {
      if(!validTenant(tenantId)||!validUuid(intentId)||!validUuid(leaseToken)||
         !["qualify","retry"].includes(transition)||
         !Number.isInteger(retryDelaySeconds)||retryDelaySeconds<0||
         retryDelaySeconds>3600) return fail("invalid_request");
      if(!admitted(config)) return fail("governance_unavailable");
      try{return await store.transaction(tx=>
        tx.finish(tenantId,intentId,leaseToken,transition,retryDelaySeconds));}
      catch{return fail("governance_unavailable");}
    }
  };
}
