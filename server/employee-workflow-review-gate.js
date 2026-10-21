/** Pure review gate for employee workflow proposals. No persistence or execution. */
const STATES=new Set(["proposed","approved","rejected"]);
export function reviewEmployeeProposal({proposal,decision,principal,reviewedAt}={}){
  if(!proposal||typeof proposal!=="object"||typeof proposal.proposalKey!=="string"||!proposal.proposalKey||proposal.status!=="proposed"||proposal.requiresHumanReview!==true)throw new TypeError("invalid_proposal");
  if(!STATES.has(decision)||decision==="proposed")throw new TypeError("invalid_decision");
  if(typeof principal?.tenantId!=="string"||!principal.tenantId||typeof principal?.actorId!=="string"||!principal.actorId)throw new TypeError("invalid_principal");
  if(!Array.isArray(principal.permissions)||!principal.permissions.includes("people.workflow.approve"))throw new Error("forbidden");
  let scope;
  try{scope=JSON.parse(proposal.proposalKey);}catch{throw new TypeError("invalid_proposal_key");}
  if(!Array.isArray(scope)||scope.length!==5||scope[0]!==principal.tenantId||scope[1]!==proposal.workflowId||scope[2]!==proposal.employeeId||scope[3]!==proposal.type||scope[4]!==proposal.dueDate)throw new Error("scope_mismatch");
  if(typeof reviewedAt!=="string"||!/^\\d{4}-\\d{2}-\\d{2}T/.test(reviewedAt)||!Number.isFinite(Date.parse(reviewedAt)))throw new TypeError("invalid_review_time");
  return {...proposal,status:decision,reviewedBy:principal.actorId,reviewedAt,requiresHumanReview:false,executionStatus:"not_executed"};
}
