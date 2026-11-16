// Static, non-interactive display for an already authorized server proposal.
// Never accepts an approval decision or performs any network action.
export function renderAgentApprovalPreview(container,result){
 if(!container||typeof container.replaceChildren!=="function"||typeof document==="undefined")return false;
 const proposal=result?.proposal;
 if(result?.ok!==true||result?.executionAllowed!==false||result?.sideEffects!==false||result?.canSubmitApproval!==false||result?.approvalState!=="not_requested"||!proposal||proposal.ok!==true||proposal.executionAllowed!==false||proposal.sideEffects!==false||!Array.isArray(proposal.proposedActions)||!Array.isArray(proposal.requiredPermissions)){
  container.replaceChildren();return false;
 }
 const section=document.createElement("section");
 section.setAttribute("aria-label","Agent approval preview");
 const heading=document.createElement("h3");heading.textContent="Draft only — approval not requested";section.append(heading);
 const row=(label,value)=>{const p=document.createElement("p"),b=document.createElement("strong");b.textContent=label+": ";p.append(b,document.createTextNode(String(value)));section.append(p);};
 row("Workflow",proposal.workflow);
 row("Proposed actions",proposal.proposedActions.join(", "));
 row("Required permissions",proposal.requiredPermissions.join(", "));
 row("Approval required",result.approvalRequired);
 row("Estimated relative cost units (not BWP)",proposal.estimatedCostUnits);
 container.replaceChildren(section);return true;
}
