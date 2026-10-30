// Pure, default-off workflow admission and transitions. No external side effects.
export const WORKFLOW_STATES = Object.freeze(["draft","validated","awaiting_approval","approved","executing","completed","failed","cancelled"]);
const transitions = Object.freeze({
  draft:["validated","cancelled"], validated:["awaiting_approval","cancelled"],
  awaiting_approval:["approved","cancelled"], approved:["executing","cancelled"],
  executing:["completed","failed"], completed:[], failed:[], cancelled:[]
});
export function admitWorkflow({enabled=false,tenantId,actor,objective,workflowId}={}) {
  if(enabled!==true) throw new Error("AGENT_WORKFLOWS_DISABLED");
  if(!tenantId || !actor?.tenantId || tenantId!==actor.tenantId || !actor?.id || !actor?.canCreateWorkflow)
    throw new Error("WORKFLOW_FORBIDDEN");
  if(typeof objective!=="string" || !objective.trim() || objective.length>2000) throw new Error("INVALID_OBJECTIVE");
  if(typeof workflowId!=="string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(workflowId)) throw new Error("INVALID_WORKFLOW_ID");
  return Object.freeze({id:workflowId,tenantId,objective:objective.trim(),state:"draft",version:0,proposalDigest:null,approval:null});
}
export function transitionWorkflow(workflow,{enabled=false,actor,to,expectedVersion,proposalDigest}={}) {
  if(enabled!==true) throw new Error("AGENT_WORKFLOWS_DISABLED");
  if(!workflow || !actor?.id || actor.tenantId!==workflow.tenantId) throw new Error("WORKFLOW_FORBIDDEN");
  if(!Number.isSafeInteger(expectedVersion) || expectedVersion!==workflow.version) throw new Error("WORKFLOW_VERSION_CONFLICT");
  if(!transitions[workflow.state]?.includes(to)) throw new Error("INVALID_WORKFLOW_TRANSITION");
  if(to==="approved" && (!actor.canApproveWorkflow || !workflow.proposalDigest || proposalDigest!==workflow.proposalDigest))
    throw new Error("WORKFLOW_APPROVAL_REQUIRED");
  if(to==="executing" && (!actor.canExecuteWorkflow || !workflow.approval || workflow.approval.digest!==workflow.proposalDigest))
    throw new Error("WORKFLOW_EXECUTION_FORBIDDEN");
  if(to==="validated" && (!actor.canCreateWorkflow || typeof proposalDigest!=="string" || !/^[a-f0-9]{64}$/.test(proposalDigest)))
    throw new Error("INVALID_PROPOSAL_DIGEST");
  const next={...workflow,state:to,version:workflow.version+1};
  if(to==="validated") next.proposalDigest=proposalDigest;
  if(to==="approved") next.approval={actorId:actor.id,digest:proposalDigest};
  return Object.freeze(next);
}
