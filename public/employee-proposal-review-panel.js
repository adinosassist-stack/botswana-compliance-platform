/** Human-reviewed employee proposal queue. Preparation never approves or executes tasks. */
export function mountEmployeeProposalReviewQueue(container,{fetcher}={}){
 if(!container||typeof container.replaceChildren!=="function"||typeof fetcher!=="function")throw new TypeError("invalid_review_queue_mount");
 const doc=container.ownerDocument;
 const section=doc.createElement("section"),title=doc.createElement("h3"),status=doc.createElement("p"),list=doc.createElement("ul");
 const button=label=>{const node=doc.createElement("button");node.type="button";node.textContent=label;return node;};
 const refresh=button("Refresh pending reviews"),generate=button("Generate review proposals"),approved=button("Approved proposals"),pending=button("Pending reviews");
 const previous=button("Previous approved proposals"),next=button("Next approved proposals");
 title.textContent="Pending employee workflow reviews";
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 approved.hidden=true;pending.hidden=true;previous.hidden=true;next.hidden=true;
 section.append(title,status,generate,refresh,approved,pending,list,previous,next);container.replaceChildren(section);
 let disposed=false,loading=false,deciding=false,generating=false,preparing=false,preparationEnabled=false;
 let view="pending",pageCursor="",nextCursor=null,history=[],actionButtons=[];
 const busy=()=>loading||deciding||generating||preparing;
 function syncControls(){
  if(disposed)return;
  for(const control of [refresh,generate,approved,pending,previous,next])control.disabled=busy();
  for(const control of actionButtons)control.disabled=busy()||control.prepared===true;
  approved.hidden=!preparationEnabled||view==="approved";pending.hidden=view!=="approved";generate.hidden=view!=="pending";
  previous.hidden=view!=="approved"||history.length===0;next.hidden=view!=="approved"||!nextCursor;
  refresh.textContent=view==="approved"?"Refresh approved proposals":"Refresh pending reviews";
 }
 async function generateReviews(){
  if(disposed||busy()||view!=="pending")return;
  generating=true;syncControls();status.textContent="Generating proposals for review…";
  try{
   const response=await fetcher("/api/employee-workflow-reviews",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({action:"generate"})});
   if(!response?.ok||response.data?.ok!==true)throw new Error("generation_failed");
   generating=false;if(!disposed)await load("pending");
  }catch{if(!disposed)status.textContent="Unable to generate proposals. Try again later.";}
  finally{generating=false;syncControls();}
 }
 async function decide(proposalKey,decision){
  if(disposed||busy()||view!=="pending")return;
  deciding=true;syncControls();status.textContent="Recording "+decision+" decision…";
  try{
   const response=await fetcher("/api/employee-workflow-reviews",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({proposalKey,decision})});
   if(!response?.ok||response.data?.ok!==true)throw new Error("decision_failed");
   deciding=false;if(!disposed)await load("pending");
  }catch{if(!disposed)status.textContent="Unable to record decision. Refresh and try again.";}
  finally{deciding=false;syncControls();}
 }
 async function prepare(proposalKey,delegationId,control){
  if(disposed||busy()||view!=="approved"||control.prepared===true)return;
  preparing=true;syncControls();status.textContent="Preparing task for owner review…";
  try{
   const response=await fetcher("/api/employee-workflow-reviews",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({action:"prepare_task",proposalKey,delegationId})});
   if(disposed)return;
   const result=response?.data;
   const messages={prepared:"Task prepared. Separate owner approval is required.",approved:"This task already has owner approval. No task was executed by this request.",executed:"This task was already executed earlier. No new task was created.",cancelled:"This task request was cancelled. No task was created."};
   if(!response?.ok||result?.ok!==true||result.execution?.performed!==false||typeof result.request?.id!=="string"||!Object.hasOwn(messages,result.request.status)){
    status.textContent=response?.status===409?"The proposal or task authorization changed. Refresh approved proposals before trying again.":"Unable to prepare the task. Refresh approved proposals and try again.";
    return;
   }
   control.prepared=true;status.textContent=messages[result.request.status];
  }catch{if(!disposed)status.textContent="Unable to prepare the task. Refresh approved proposals and try again.";}
  finally{preparing=false;syncControls();}
 }
 async function load(requestedView=view,after="",previousCursors=[]){
  if(disposed||busy())return;
  loading=true;syncControls();status.textContent=requestedView==="approved"?"Loading approved proposals…":"Loading pending reviews…";
  try{
   const path=requestedView==="approved"?"/api/employee-workflow-reviews?view=approved"+(after?"&after="+encodeURIComponent(after):""):"/api/employee-workflow-reviews";
   const response=await fetcher(path);
   if(!response?.ok||response.data?.ok!==true||!Array.isArray(response.data.proposals))throw new Error("invalid_response");
   if(disposed)return;
   const data=response.data;
   if(requestedView==="approved"&&data.taskPreparationEnabled!==true)throw new Error("preparation_disabled");
   let delegationId=null,grantReadFailed=false;
   // Grant discovery is user-requested; never adds a request to the initial People mount.
   if(requestedView==="approved"&&data.proposals.length){
    try{
     const grants=await fetcher("/api/agentic/task-execution/status");
     const active=grants?.data?.activeGrants;
     if(!grants?.ok||grants.data?.schemaReady!==true||!Array.isArray(active))throw new Error("grant_read_failed");
     if(active.length===1&&typeof active[0]?.delegationId==="string"&&active[0].delegationId.length&&active[0].delegationId.length<=120)delegationId=active[0].delegationId;
    }catch{grantReadFailed=true;}
   }
   if(disposed)return;
   view=requestedView;pageCursor=after;history=previousCursors.slice();
   preparationEnabled=data.taskPreparationEnabled===true;
   nextCursor=view==="approved"&&typeof data.nextCursor==="string"&&data.nextCursor.length>0&&data.nextCursor.length<=2048?data.nextCursor:null;
   title.textContent=view==="approved"?"Approved employee workflow proposals":"Pending employee workflow reviews";
   list.replaceChildren();actionButtons=[];
   for(const proposal of data.proposals.slice(0,view==="approved"?25:100)){
    const item=doc.createElement("li"),description=doc.createElement("span");
    if(view==="approved"){
     description.textContent=[proposal.payload?.title,proposal.payload?.employeeId,proposal.payload?.dueDate].map(value=>String(value||"")).join(" · ");
     item.append(description);
     if(delegationId&&typeof proposal.proposalKey==="string"&&proposal.proposalKey.length>0&&proposal.proposalKey.length<=2048){
      const control=button("Prepare task for owner review");control.addEventListener("click",()=>{void prepare(proposal.proposalKey,delegationId,control);});
      actionButtons.push(control);item.append(control);
     }
    }else{
     description.textContent=[proposal.task_type,proposal.employee_id,proposal.due_date].map(value=>String(value||"")).join(" · ");item.append(description);
     if(typeof proposal.proposal_key==="string"&&proposal.proposal_key.length){
      for(const [decision,label] of [["approved","Approve"],["rejected","Reject"]]){
       const control=button(label);control.setAttribute("aria-label",label+" employee workflow proposal");
       control.addEventListener("click",()=>{if(!deciding&&!loading)void decide(proposal.proposal_key,decision);});
       actionButtons.push(control);item.append(control);
      }
     }
    }
    list.append(item);
   }
   status.textContent=view==="pending"?(data.proposals.length?data.proposals.length+" pending review(s). Review decisions do not execute employee actions.":"No pending reviews."):
    !data.proposals.length?"No eligible approved proposals.":grantReadFailed?"Task preparation is unavailable. Refresh to try again.":!delegationId?"An owner must authorize internal task creation before these tasks can be prepared.":data.proposals.length+" approved proposal(s) on this page. Preparing a task requires separate owner approval.";
  }catch{if(!disposed)status.textContent=requestedView==="approved"?"Unable to load approved proposals. Try refreshing.":"Unable to load pending reviews. Try refreshing.";}
  finally{loading=false;syncControls();}
 }
 generate.addEventListener("click",()=>{void generateReviews();});
 refresh.addEventListener("click",()=>{void load(view,pageCursor,history);});
 approved.addEventListener("click",()=>{void load("approved");});pending.addEventListener("click",()=>{void load("pending");});
 next.addEventListener("click",()=>{if(nextCursor)void load("approved",nextCursor,[...history,pageCursor]);});
 previous.addEventListener("click",()=>{if(history.length)void load("approved",history.at(-1),history.slice(0,-1));});
 void load();
 return ()=>{disposed=true;container.replaceChildren();};
}
