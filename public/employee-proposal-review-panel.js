/** Read-only review queue UI. Does not submit decisions or execute actions. */
export function mountEmployeeProposalReviewQueue(container,{fetcher}={}){
 if(!container||typeof container.replaceChildren!=="function"||typeof fetcher!=="function")throw new TypeError("invalid_review_queue_mount");
 const doc=container.ownerDocument;
 const section=doc.createElement("section"),title=doc.createElement("h3"),status=doc.createElement("p"),list=doc.createElement("ul"),refresh=doc.createElement("button");
 title.textContent="Pending employee workflow reviews";
 status.setAttribute("role","status");
 refresh.type="button";refresh.textContent="Refresh pending reviews";
 section.append(title,status,refresh,list);container.replaceChildren(section);
 let disposed=false,loading=false;
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
    const item=doc.createElement("li");
    item.textContent=[proposal.task_type,proposal.employee_id,proposal.due_date].map(value=>String(value||"")).join(" · ");
    list.append(item);
   }
   status.textContent=data.proposals.length?data.proposals.length+" pending review(s). Decisions require authorized approval.":"No pending reviews.";
  }catch{if(!disposed)status.textContent="Unable to load pending reviews. Try refreshing.";}
  finally{loading=false;refresh.disabled=false;}
 }
 refresh.addEventListener("click",load);void load();
 return ()=>{disposed=true;container.replaceChildren();};
}
