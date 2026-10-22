import {prepareEmployeeProposalTask} from "./agentic-task-execution.js";
import {createEmployeeProposalReviewD1Store} from "./employee-proposal-review-d1-store.js";
import {generateEmployeeWorkflowReviews} from "./employee-workflow-review-generation.js";
/** Isolated authenticated review API adapter; must be mounted behind session validation. */
export async function handleEmployeeProposalReviewRequest({req,env,session,readJson,roleAllowed}={}){
 const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
 if(!session?.tenant_id||!session?.user_id)return respond({error:"unauthenticated"},401);
 if(!roleAllowed(session,"owner","manager"))return respond({error:"forbidden"},403);
 if(!["GET","POST"].includes(req?.method))return new Response(JSON.stringify({error:"method_not_allowed"}),{status:405,headers:{"content-type":"application/json","cache-control":"no-store","allow":"GET, POST"}});
 if(typeof env?.DB?.prepare!=="function")return respond({error:"storage_unavailable"},503);
 const store=createEmployeeProposalReviewD1Store(env.DB);
 try{
  if(req.method==="GET"){
   const params=new URL(req.url||"https://internal.invalid/api/employee-workflow-reviews").searchParams;
   const view=params.get("view")||"pending";
   if(!["pending","approved"].includes(view)||String(params.get("after")||"").length>2048)return respond({error:"invalid_review_view"},400);
   const taskPreparationEnabled=env.THEBE_EMPLOYEE_TASK_PREPARATION_ENABLED==="true";
   if(view==="approved"){
    if(!taskPreparationEnabled)return respond({error:"employee_task_preparation_disabled"},409);
    const page=await store.listApprovedProvenance({tenantId:session.tenant_id,after:params.get("after")||""});
    return respond({ok:true,...page,taskPreparationEnabled});
   }
   return respond({ok:true,proposals:await store.listPending({tenantId:session.tenant_id}),taskPreparationEnabled});
  }
  let body;
  try{body=await readJson(req,{maxBytes:4096});}catch{return respond({error:"invalid_json"},400);}
  if(body?.action==="prepare_task"){
   if(Object.keys(body).some(key=>!["action","proposalKey","delegationId"].includes(key)))return respond({error:"invalid_employee_task_request"},400);
   return await prepareEmployeeProposalTask({env,auth:session,proposalKey:body.proposalKey,delegationId:body.delegationId});
  }
  if(body?.action==="generate"){
   if(Object.keys(body).some(key=>key!=="action"))return respond({error:"invalid_generation_request"},400);
   const today=new Date().toISOString().slice(0,10);
   const generated=await generateEmployeeWorkflowReviews({db:env.DB,tenantId:session.tenant_id,ownerId:session.user_id,today});
   return respond(generated);
  }
  if(!body||typeof body.proposalKey!=="string"||body.proposalKey.length>2048||!["approved","rejected"].includes(body.decision))return respond({error:"invalid_decision"},400);
  // Reviewer and tenant identity always come from the verified session.
  const changed=await store.decide({tenantId:session.tenant_id,proposalKey:body.proposalKey,reviewerId:session.user_id,decision:body.decision,reviewedAt:new Date().toISOString()});
  return changed?respond({ok:true,status:body.decision}):respond({ok:false,error:"not_pending"},409);
 }catch{return respond({error:"storage_unavailable"},503);}
}
