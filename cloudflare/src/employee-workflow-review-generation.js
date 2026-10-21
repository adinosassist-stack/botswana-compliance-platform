import {previewEmployeeWorkflows} from "../../server/employee-workflow-definitions.js";
import {createEmployeeProposalReviewD1Store} from "./employee-proposal-review-d1-store.js";

/** Server-only, tenant-scoped, manual generation of review proposals. Never executes actions. */
export async function generateEmployeeWorkflowReviews({db,tenantId,ownerId,today}={}){
 if(!db||typeof db.prepare!=="function"||typeof tenantId!=="string"||!tenantId.trim()||typeof ownerId!=="string"||!ownerId.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new TypeError("invalid_generation_scope");
 const workflowsResult=await db.prepare("SELECT definition FROM employee_ai_workflows WHERE tenant_id=? AND owner_id=? ORDER BY updated_at DESC LIMIT 100").bind(tenantId,ownerId).all();
 if(workflowsResult?.success!==true||!Array.isArray(workflowsResult.results))throw new Error("storage_unavailable");
 const workflows=workflowsResult.results.map(row=>JSON.parse(row.definition)).filter(w=>w.effect==="propose_internal_task"&&["onboarding_checklist","contract_renewal"].includes(w.routineType));
 const employeesResult=await db.prepare("SELECT id,start_date,end_date,status FROM employees WHERE tenant_id=? AND lower(trim(coalesce(status,'')))='active' ORDER BY id LIMIT 10000").bind(tenantId).all();
 if(employeesResult?.success!==true||!Array.isArray(employeesResult.results))throw new Error("storage_unavailable");
 // The current employee schema supplies start_date and end_date only.\n // end_date is not necessarily a contract-renewal date, so do not infer it.\n const employees=employeesResult.results.map(row=>({id:row.id,tenantId,active:true,startDate:row.start_date}));
 const preview=previewEmployeeWorkflows({tenantId,today,employees,workflows,runManual:true});
 const store=createEmployeeProposalReviewD1Store(db);
 let inserted=0;
 for(const proposal of preview.proposals){
  const result=await store.enqueue({tenantId,proposal});
  if(result.inserted)inserted++;
 }
 return {ok:true,generated:preview.proposalCount,inserted,duplicateCount:preview.proposalCount-inserted,executed:0};
}
