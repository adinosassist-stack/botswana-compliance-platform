// Read-only PostgreSQL adapter for known simulated agent workflow actions.
// Uses verified 20261015_agent_action_governance.sql columns; no mutations.
const actionWorkflow=Object.freeze({
 draft_internal_task:"employee_task_assignment",
 draft_followup_message:"overdue_invoice_followup",
 draft_management_report:"monthly_management_report"
});
export function createPostgresAgentApprovalHistoryReader(pool){
 if(!pool||typeof pool.query!=="function")throw Error("invalid_history_pool");
 return {
  async listTenantApprovals({tenantId,actorId,limit=20}={}){
   const valid=x=>typeof x==="string"&&x.length>0&&x.length<=128&&x.trim()===x;
   if(!valid(tenantId)||actorId!==undefined&&!valid(actorId)||!Number.isInteger(limit)||limit<1||limit>50)throw Error("invalid_history_scope");
   const actions=Object.keys(actionWorkflow);
   const sql=`select id, tenant_id, actor_id, action, status, consumed_at, created_at
     from agent_action_approvals
     where tenant_id=$1 and ($2::text is null or actor_id=$2)
       and action = any($3::text[])
     order by created_at desc, id desc limit $4`;
   const result=await pool.query(sql,[tenantId,actorId??null,actions,limit]);
   if(!Array.isArray(result?.rows))throw Error("invalid_history_result");
   return result.rows.map(row=>{
    const workflow=actionWorkflow[row.action];
    if(!workflow)throw Error("unknown_history_action");
    return {
     id:String(row.id),tenantId:row.tenant_id,actorId:row.actor_id,workflow,
     status:row.consumed_at!=null?"consumed":row.status==="pending"?"requested":row.status,
     timestamp:new Date(row.created_at).toISOString()
    };
   });
  }
 };
}
