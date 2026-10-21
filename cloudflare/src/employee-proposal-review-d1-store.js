/** Tenant-scoped D1 review queue adapter. All writes require authenticated service callers. */
export function createEmployeeProposalReviewD1Store(db){
 if(!db||typeof db.prepare!=="function")throw new TypeError("invalid_d1");
 const scope=value=>typeof value==="string"&&value.trim().length>0;
 return {
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
