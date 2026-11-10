// Inert, text-only rendering of a previously authenticated and tenant-scoped
// approval history projection. No API requests, approvals or side effects.
export function renderAgentApprovalHistory(container,history){
 if(!container||typeof container.replaceChildren!=="function"||typeof document==="undefined")return false;
 if(history?.ok!==true||history.readOnly!==true||!Array.isArray(history.items)||history.items.length>50||
 history.items.some(x=>!x||typeof x.id!=="string"||typeof x.workflow!=="string"||typeof x.status!=="string"||typeof x.timestamp!=="string")){
  container.replaceChildren();return false;
 }
 const section=document.createElement("section");section.setAttribute("aria-label","Agent approval history");
 const title=document.createElement("h3");title.textContent="Approval history — read only";section.append(title);
 if(history.items.length===0){const empty=document.createElement("p");empty.textContent="No approval records available";section.append(empty);}
 else{
  const list=document.createElement("ul");
  for(const record of history.items){
   const item=document.createElement("li");
   item.textContent=record.workflow+" — "+record.status+" — "+record.timestamp;
   list.append(item);
  }
  section.append(list);
 }
 container.replaceChildren(section);return true;
}
