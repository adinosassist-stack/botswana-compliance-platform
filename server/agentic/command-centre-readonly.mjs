// Read-only presentation model. Caller must supply already-authorized tenant records.
export function buildAgentCommandCentre({workflows=[],tenantId,actor}={}){
 if(!tenantId||!actor?.id||actor.tenantId!==tenantId||!actor.canViewWorkflows)throw new Error("WORKFLOW_FORBIDDEN");
 if(!Array.isArray(workflows)||workflows.length>10000)throw new Error("INVALID_WORKFLOWS");
 const rows=workflows.filter(w=>w?.tenantId===tenantId).map(w=>({
  id:String(w.id),state:String(w.state),objective:String(w.objective||"").slice(0,200),
  version:w.version,requiresApproval:w.state==="awaiting_approval"
 }));
 const counts={active:0,pendingApproval:0,completed:0,failed:0};
 for(const w of rows){
  if(w.state==="awaiting_approval")counts.pendingApproval++;
  if(w.state==="completed")counts.completed++;
  if(w.state==="failed")counts.failed++;
  if(["draft","validated","approved","executing"].includes(w.state))counts.active++;
 }
 return Object.freeze({counts,workflows:rows,readOnly:true});
}
