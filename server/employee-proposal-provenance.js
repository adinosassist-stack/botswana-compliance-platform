import {validateEmployeeWorkflow} from './employee-workflow-definitions.js';

const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_:.\-]{1,200}$/.test(value);
async function digest(value){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Content-address a server-generated proposal using a trusted workflow row.
 * This function grants no approval or execution authority.
 */
export async function buildEmployeeProposalProvenance({tenantId,authorId,sourceDefinition,proposal}={}){
 if(!validId(tenantId)||!validId(authorId)||typeof sourceDefinition!=='string'||sourceDefinition.length>16384)throw new TypeError('invalid_provenance_scope');
 const workflow=validateEmployeeWorkflow(JSON.parse(sourceDefinition));
 if(!workflow.enabled||workflow.effect!=='propose_internal_task')throw new TypeError('invalid_provenance_workflow');
 if(!proposal||proposal.status!=='proposed'||proposal.requiresHumanReview!==true||proposal.effect!==workflow.effect||
    proposal.workflowId!==workflow.id||proposal.workflowName!==workflow.name||proposal.type!==workflow.routineType||
    !validId(proposal.employeeId)||typeof proposal.title!=='string'||!proposal.title.trim()||proposal.title!==proposal.title.trim()||proposal.title.length>160||
    !['normal','high'].includes(proposal.severity))throw new TypeError('invalid_provenance_proposal');
 const due=proposal.dueDate;
 if(typeof due!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T00:00:00.000Z'))||new Date(due+'T00:00:00.000Z').toISOString().slice(0,10)!==due)throw new TypeError('invalid_provenance_deadline');
 const expected=[tenantId,workflow.id,proposal.employeeId,proposal.type,due];
 let parts;try{parts=JSON.parse(proposal.proposalKey)}catch{throw new TypeError('invalid_provenance_key')}
 if(!Array.isArray(parts)||parts.length!==5||parts.some((value,index)=>value!==expected[index]))throw new TypeError('provenance_scope_mismatch');
 const employeeId=proposal.employeeId,type=proposal.type;
 const payloadJson=JSON.stringify({workflowId:workflow.id,workflowName:workflow.name,employeeId,type,dueDate:due,title:proposal.title,severity:proposal.severity,effect:workflow.effect});
 const workflowRevision=await digest(sourceDefinition),proposalRevision=await digest(payloadJson);
 const proposalKey=JSON.stringify(['employee-proposal-v2',tenantId,authorId,workflow.id,workflowRevision,employeeId,type,due,proposalRevision]);
 return Object.freeze({tenantId,authorId,workflowId:workflow.id,workflowRevision,proposalRevision,sourceDefinition,payloadJson,proposalKey});
}
