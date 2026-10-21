/** Human-reviewed employee proposal queue. Approvals never execute employee actions. */
export function mountEmployeeProposalReviewQueue(container,{fetcher}={}){
 if(!container||typeof container.replaceChildren!=="function"||typeof fetcher!=="function")throw new TypeError("invalid_review_queue_mount");
 const doc=container.ownerDocument;
 const section=doc.createElement("section"),title=doc.createElement("h3"),status=doc.createElement("p"),list=doc.createElement("ul"),refresh=doc.createElement("button"),generate=doc.createElement("button");
 title.textContent="Pending employee workflow reviews";
 status.setAttribute("role","status");
 refresh.type="button";refresh.textContent="Refresh pending reviews";
 generate.type="button";generate.textContent="Generate review proposals";
 section.append(title,status,generate,refresh,list);container.replaceChildren(section);
 let disposed=false,loading=false,deciding=false,generating=false;
 async function generateReviews(){
  if(disposed||loading||deciding||generating)return;
  generating=true;generate.disabled=true;refresh.disabled=true;status.textContent="Generating proposals for review…";
  try{
   const response=await fetcher("/api/employee-workflow-reviews",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({action:"generate"})});
   if(!response?.ok||response.data?.ok!==true)throw new Error("generation_failed");
   if(!disposed)await load();
  }catch{if(!disposed)status.textContent="Unable to generate proposals. Try again later."}
  finally{generating=false;generate.disabled=false;refresh.disabled=false;}
 }
 generate.addEventListener("click",()=>{void generateReviews();});
 async function decide(proposalKey,decision){
  if(disposed||deciding||loading)return;
  deciding=true;refresh.disabled=true;status.textContent="Recording "+decision+" decision…";
  try{
   const response=await fetcher("/api/employee-workflow-reviews",{
    method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
    body:JSON.stringify({proposalKey,decision})
   });
   if(!response?.ok||response.data?.ok!==true)throw new Error("decision_failed");
   if(disposed)return;
   status.textContent="Decision recorded. No employee action was executed.";
   await load();
  }catch{if(!disposed)status.textContent="Unable to record decision. Refresh and try again.";}
  finally{deciding=false;refresh.disabled=false;}
 }
 async function load(){
  if(disposed||loading)return;
  loading=true;refresh.disabled=true;status.textContent="Loading pending reviews…";
  try{
   const response=await fetcher("/api/employee-workflow-reviews");
   if(!response?.ok)throw new Error("unavailable");
   const data=response.data;
   if(!data?.ok||!Array.isArray(data.proposals))throw new Error("invalid_response");
   if(disposed)return;
   list.replaceChildren();
   for(const proposal of data.proposals.slice(0,100)){
    const item=doc.createElement("li"),description=doc.createElement("span");
    description.textContent=[proposal.task_type,proposal.employee_id,proposal.due_date].map(value=>String(value||"")).join(" · ");
    item.append(description);
    if(typeof proposal.proposal_key==="string"&&proposal.proposal_key.length){
     for(const [decision,label] of [["approved","Approve"],["rejected","Reject"]]){
      const button=doc.createElement("button");
      button.type="button";button.textContent=label;
      button.setAttribute("aria-label",label+" employee workflow proposal");
      button.addEventListener("click",()=>{if(!deciding&&!loading)void decide(proposal.proposal_key,decision);});
      item.append(button);
     }
    }
    list.append(item);
   }
   status.textContent=data.proposals.length?data.proposals.length+" pending review(s). Decisions require manager approval.":"No pending reviews.";
  }catch{if(!disposed)status.textContent="Unable to load pending reviews. Try refreshing.";}
  finally{loading=false;refresh.disabled=false;}
 }
 refresh.addEventListener("click",()=>{if(!deciding)void load();});void load();
 return ()=>{disposed=true;container.replaceChildren();};
}
