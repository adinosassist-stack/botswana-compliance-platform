// Browser-only, static preview presentation. No API calls, tool execution or persistence.
// The caller must supply an already authenticated server-authorized preview result.
export function renderAgentSimulationPreview(container,preview){
  if(!container||typeof container.replaceChildren!=="function"||typeof document==="undefined")return false;
  if(!preview||preview.ok!==true||preview.executionAllowed!==false||preview.sideEffects!==false||preview.isolated!==true||!Array.isArray(preview.proposedActions)||!Array.isArray(preview.requiredPermissions)){
    container.replaceChildren();return false;
  }
  const section=document.createElement("section");section.setAttribute("aria-label","Agent simulation preview");
  const title=document.createElement("h3");title.textContent="Simulation only — no actions executed";section.append(title);
  const field=(label,value)=>{const row=document.createElement("p");const name=document.createElement("strong");name.textContent=label+": ";row.append(name,document.createTextNode(String(value)));section.append(row);};
  field("Workflow",preview.workflow);
  field("Proposed actions",preview.proposedActions.join(", "));
  field("Required permissions",preview.requiredPermissions.join(", "));
  field("Approval",preview.approvalRequired);
  field("Relative cost units (not BWP)",preview.estimatedCostUnits);
  field("Expected outcome",preview.expectedResult);
  container.replaceChildren(section);return true;
}
