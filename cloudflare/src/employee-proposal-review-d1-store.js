import {buildEmployeeProposalProvenance} from '../../server/employee-proposal-provenance.js';
// Shared read/write eligibility predicate; callers bind tenant and proposal key.
export const APPROVED_EMPLOYEE_PROVENANCE_SQL=`SELECT p.*,r.reviewed_by reviewer_id,r.reviewed_at
    FROM employee_ai_proposal_provenance p
    JOIN employee_ai_proposal_reviews r ON r.tenant_id=p.tenant_id AND r.proposal_key=p.proposal_key
    JOIN employee_ai_proposal_review_events h ON h.tenant_id=r.tenant_id AND h.proposal_key=r.proposal_key
    JOIN employee_ai_workflows w ON w.tenant_id=p.tenant_id AND w.owner_id=p.author_id AND w.workflow_id=p.workflow_id
    JOIN memberships reviewer ON reviewer.tenant_id=p.tenant_id AND reviewer.user_id=r.reviewed_by
    JOIN memberships author ON author.tenant_id=p.tenant_id AND author.user_id=p.author_id
    JOIN employees e ON e.tenant_id=p.tenant_id AND e.id=r.employee_id
    WHERE p.tenant_id=? AND p.proposal_key=?
     AND r.status='approved' AND h.decision='approved' AND h.reviewer_id=r.reviewed_by AND h.reviewed_at=r.reviewed_at
     AND r.reviewed_by<>p.author_id AND reviewer.status='active' AND reviewer.role IN ('owner','manager')
     AND author.status='active' AND author.role IN ('owner','manager')
     AND w.definition=p.workflow_definition AND r.workflow_id=p.workflow_id
     AND r.workflow_id=json_extract(p.proposal_json,'$.workflowId')
     AND r.employee_id=json_extract(p.proposal_json,'$.employeeId')
     AND r.task_type=json_extract(p.proposal_json,'$.type') AND r.due_date=json_extract(p.proposal_json,'$.dueDate')
     AND r.task_type='onboarding_checklist' AND e.start_date=r.due_date AND lower(trim(coalesce(e.status,'')))='active'`;
/** Tenant-scoped D1 review queue adapter. All writes require authenticated service callers. */
export function createEmployeeProposalReviewD1Store(db){
 if(!db||typeof db.prepare!=="function")throw new TypeError("invalid_d1");
 const scope=value=>typeof value==="string"&&value.trim().length>0;
 return {
  async enqueueVersioned(input){
   const binding=await buildEmployeeProposalProvenance(input);
   if(typeof db.batch!=='function')throw new Error('atomic_batch_unavailable');
   const {tenantId,authorId,sourceDefinition}=binding;
   const proposal=JSON.parse(binding.payloadJson);
   const review=db.prepare(`INSERT OR IGNORE INTO employee_ai_proposal_reviews
    (tenant_id,proposal_key,workflow_id,employee_id,task_type,due_date)
    SELECT ?,?,?,?,?,? WHERE EXISTS (
     SELECT 1 FROM employee_ai_workflows w
     JOIN memberships m ON m.tenant_id=w.tenant_id AND m.user_id=w.owner_id
     JOIN employees e ON e.tenant_id=w.tenant_id
     WHERE w.tenant_id=? AND w.owner_id=? AND w.workflow_id=? AND w.definition=?
      AND m.status='active' AND m.role IN ('owner','manager')
      AND e.id=? AND lower(trim(coalesce(e.status,'')))='active'
      AND ?='onboarding_checklist' AND e.start_date=?
    )`).bind(tenantId,binding.proposalKey,binding.workflowId,proposal.employeeId,proposal.type,proposal.dueDate,
     tenantId,authorId,binding.workflowId,sourceDefinition,proposal.employeeId,proposal.type,proposal.dueDate);
   const provenance=db.prepare(`INSERT INTO employee_ai_proposal_provenance
    (tenant_id,proposal_key,author_id,workflow_id,workflow_revision,proposal_revision,workflow_definition,proposal_json)
    SELECT ?,?,?,?,?,?,?,? FROM employee_ai_proposal_reviews
    WHERE tenant_id=? AND proposal_key=? AND changes()=1`).bind(
     tenantId,binding.proposalKey,authorId,binding.workflowId,binding.workflowRevision,binding.proposalRevision,sourceDefinition,binding.payloadJson,
     tenantId,binding.proposalKey);
   const results=await db.batch([review,provenance]);
   if(!Array.isArray(results)||results.length!==2||results.some(row=>row?.success!==true))throw new Error('storage_unavailable');
   const created=Number(results[0].meta?.changes||0),bound=Number(results[1].meta?.changes||0);
   if(created===1&&bound===1)return {ok:true,inserted:true,proposalKey:binding.proposalKey};
   if(created===0&&bound===0){
    const existing=await db.prepare('SELECT author_id,workflow_revision,proposal_revision,workflow_definition,proposal_json FROM employee_ai_proposal_provenance WHERE tenant_id=? AND proposal_key=?').bind(tenantId,binding.proposalKey).first();
    if(existing&&existing.author_id===authorId&&existing.workflow_revision===binding.workflowRevision&&existing.proposal_revision===binding.proposalRevision&&existing.workflow_definition===sourceDefinition&&existing.proposal_json===binding.payloadJson)return {ok:true,inserted:false,proposalKey:binding.proposalKey};
    throw new Error('source_revision_stale');
   }
   throw new Error('provenance_integrity_failure');
  },
  // A read snapshot only, not an execution grant. The executor must recheck
  // these predicates atomically with effect creation and fenced completion.
  async loadApprovedProvenance({tenantId,proposalKey}){
   if(!scope(tenantId)||!scope(proposalKey)||proposalKey.length>2048)throw new TypeError('invalid_provenance_scope');
   const row=await db.prepare(`${APPROVED_EMPLOYEE_PROVENANCE_SQL}
    LIMIT 1`).bind(tenantId,proposalKey).first();
   if(!row)return null;
   try{
    const payload=JSON.parse(row.proposal_json);
    const originalKey=JSON.stringify([tenantId,payload.workflowId,payload.employeeId,payload.type,payload.dueDate]);
    const verified=await buildEmployeeProposalProvenance({tenantId,authorId:row.author_id,sourceDefinition:row.workflow_definition,
     proposal:{...payload,proposalKey:originalKey,status:'proposed',requiresHumanReview:true}});
    if(verified.proposalKey!==proposalKey||verified.workflowRevision!==row.workflow_revision||verified.proposalRevision!==row.proposal_revision||verified.payloadJson!==row.proposal_json)return null;
    return Object.freeze({proposalKey,authorId:row.author_id,workflowId:row.workflow_id,workflowRevision:row.workflow_revision,proposalRevision:row.proposal_revision,
     reviewerId:row.reviewer_id,reviewedAt:row.reviewed_at,payload:Object.freeze(payload)});
   }catch{return null}
  },
  async enqueue({tenantId,proposal}){
   if(!scope(tenantId)||!proposal||typeof proposal.proposalKey!=="string"||!proposal.proposalKey||proposal.status!=="proposed"||proposal.requiresHumanReview!==true)throw new TypeError("invalid_proposal");
   let parts;
   try{parts=JSON.parse(proposal.proposalKey);}catch{throw new TypeError("invalid_proposal_key");}
   if(!Array.isArray(parts)||parts.length!==5||parts[0]!==tenantId||parts[1]!==proposal.workflowId||parts[2]!==proposal.employeeId||parts[3]!==proposal.type||parts[4]!==proposal.dueDate)throw new Error("scope_mismatch");
   const result=await db.prepare("INSERT OR IGNORE INTO employee_ai_proposal_reviews (tenant_id,proposal_key,workflow_id,employee_id,task_type,due_date) VALUES (?,?,?,?,?,?)").bind(tenantId,proposal.proposalKey,proposal.workflowId,proposal.employeeId,proposal.type,proposal.dueDate).run();
   if(result?.success!==true)throw new Error("storage_unavailable");
   return {ok:true,inserted:Number(result.meta?.changes||0)===1};
  },
  async listPending({tenantId}){
   if(!scope(tenantId))throw new TypeError("invalid_tenant");
   const result=await db.prepare("SELECT proposal_key,workflow_id,employee_id,task_type,due_date,status,created_at FROM employee_ai_proposal_reviews WHERE tenant_id=? AND status='proposed' ORDER BY created_at ASC LIMIT 100").bind(tenantId).all();
   if(result?.success!==true||!Array.isArray(result.results))throw new Error("storage_unavailable");
   return result.results;
  },
  async decide({tenantId,proposalKey,reviewerId,decision,reviewedAt}){
   if(!scope(tenantId)||!scope(proposalKey)||!scope(reviewerId)||!["approved","rejected"].includes(decision)||typeof reviewedAt!=="string"||!Number.isFinite(Date.parse(reviewedAt)))throw new TypeError("invalid_decision");
   // D1 batch executes the decision and audit insert as a single transaction.
   // The audit insert is conditional on the row having transitioned from proposed.
   if(typeof db.batch!=="function")throw new Error("atomic_batch_unavailable");
   const update=db.prepare("UPDATE employee_ai_proposal_reviews SET status=?,reviewed_by=?,reviewed_at=? WHERE tenant_id=? AND proposal_key=? AND status='proposed'").bind(decision,reviewerId,reviewedAt,tenantId,proposalKey);
   const audit=db.prepare("INSERT INTO employee_ai_proposal_review_events (tenant_id,proposal_key,decision,reviewer_id,reviewed_at) SELECT tenant_id,proposal_key,status,reviewed_by,reviewed_at FROM employee_ai_proposal_reviews WHERE tenant_id=? AND proposal_key=? AND status=? AND reviewed_by=? AND reviewed_at=? AND NOT EXISTS (SELECT 1 FROM employee_ai_proposal_review_events WHERE tenant_id=? AND proposal_key=?)").bind(tenantId,proposalKey,decision,reviewerId,reviewedAt,tenantId,proposalKey);
   const results=await db.batch([update,audit]);
   if(!Array.isArray(results)||results.length!==2||results.some(result=>result?.success!==true))throw new Error("storage_unavailable");
   const changed=Number(results[0].meta?.changes||0)===1;
   if(changed&&Number(results[1].meta?.changes||0)!==1)throw new Error("audit_integrity_failure");
   return changed;
  }
 };
}
