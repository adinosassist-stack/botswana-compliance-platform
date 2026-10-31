// Pure deterministic preview only. It cannot execute tools or establish runtime authority.
const WORKFLOWS=Object.freeze({
  employee_task_assignment:Object.freeze({actions:Object.freeze(["draft_internal_task"]),permissions:Object.freeze(["people:tasks:propose"]),approval:"owner_or_manager",costUnits:1}),
  overdue_invoice_followup:Object.freeze({actions:Object.freeze(["draft_followup_message"]),permissions:Object.freeze(["finance:invoices:read","communications:draft"]),approval:"owner",costUnits:2}),
  monthly_management_report:Object.freeze({actions:Object.freeze(["draft_management_report"]),permissions:Object.freeze(["analytics:reports:read"]),approval:"owner",costUnits:3})
});
export function simulateAgentWorkflow(input={}){
  const reject=reason=>Object.freeze({ok:false,reason,executionAllowed:false,sideEffects:false});
  if(!input||typeof input!=="object"||Array.isArray(input))return reject("invalid_input");
  const {tenantId,actorId,actorRole,workflow,simulationId}=input;
  if(![tenantId,actorId,simulationId].every(x=>typeof x==="string"&&x.trim()===x&&x.length>0&&x.length<=128))return reject("invalid_context");
  if(!["owner","manager"].includes(actorRole))return reject("role_not_eligible");
  if(!Object.hasOwn(WORKFLOWS,workflow))return reject("unknown_workflow");
  if(actorRole==="manager"&&workflow!=="employee_task_assignment")return reject("owner_required");
  const w=WORKFLOWS[workflow];
  return Object.freeze({ok:true,tenantId,actorId,simulationId,workflow,proposedActions:Object.freeze([...w.actions]),requiredPermissions:Object.freeze([...w.permissions]),approvalRequired:w.approval,estimatedCostUnits:w.costUnits,expectedResult:"draft_only",executionAllowed:false,sideEffects:false,isolated:true,requiresRuntimeAuthorization:true});
}
