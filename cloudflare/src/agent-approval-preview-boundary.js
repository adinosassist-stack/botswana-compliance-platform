// Pure proposal boundary. No route, persistence, provider call, or approval execution.
import {simulateAgentWorkflow} from "./agent-workflow-simulation.js";

const isId=x=>typeof x==="string"&&x.length>0&&x.length<=128&&x.trim()===x;
const allowed=Object.freeze(["employee_task_assignment","overdue_invoice_followup","monthly_management_report"]);
export function prepareAgentApprovalPreview({identity,request}={}){
 const deny=code=>Object.freeze({ok:false,code,executionAllowed:false,sideEffects:false});
 // Identity MUST come from an authenticated server session, never an HTTP body.
 if(!identity||!request||typeof identity!=="object"||Array.isArray(identity)||typeof request!=="object"||Array.isArray(request))return deny("invalid_input");
 const {tenantId,actorId,actorRole}=identity;
 if(![tenantId,actorId].every(isId)||!["owner","manager"].includes(actorRole))return deny("invalid_identity");
 if(!isId(request.simulationId)||!allowed.includes(request.workflow))return deny("invalid_request");
 // Reject caller-supplied authority, tenant overrides, or execution flags.
 if(Object.keys(request).some(k=>!["workflow","simulationId"].includes(k)))return deny("unexpected_request_field");
 const simulation=simulateAgentWorkflow({tenantId,actorId,actorRole,workflow:request.workflow,simulationId:request.simulationId});
 if(!simulation.ok)return deny(simulation.reason||"simulation_denied");
 return Object.freeze({ok:true,proposal:simulation,approvalState:"not_requested",approvalRequired:simulation.approvalRequired,executionAllowed:false,sideEffects:false,canSubmitApproval:false});
}
