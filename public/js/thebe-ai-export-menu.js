/** AI Dock export menu: visual controls remain absent until server capability is verified.
 * No endpoint or route is registered by this module; never infer entitlement from local storage.
 */
(function(global){
 "use strict";
 const formats=Object.freeze(["pdf","docx","pptx"]);
 function mountExportAction({container,capability,onExport}={}){
  if(!container||capability?.enabled!==true||capability?.authenticated!==true||
     capability?.tenantAuthorized!==true||typeof onExport!=="function")return null;
  const document=container.ownerDocument;
  const select=document.createElement("select");
  select.setAttribute("aria-label","Document export format");
  for(const format of formats){const option=document.createElement("option");option.value=format;option.textContent=format.toUpperCase();select.append(option)}
  const button=document.createElement("button");button.type="button";button.textContent="Export";button.setAttribute("aria-label","Export Thebe document");
  const status=document.createElement("span");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  let busy=false;
  button.addEventListener("click",async()=>{
   if(busy)return;
   busy=true;button.disabled=true;select.disabled=true;status.textContent="Preparing export";
   try{await onExport(select.value);status.textContent="Export request submitted"}
   catch{status.textContent="Export unavailable. Try again later"}
   finally{busy=false;button.disabled=false;select.disabled=false}
  });
  const group=document.createElement("div");group.className="thebe-ai-export-menu";
  group.append(select,button,status);container.append(group);return group;
 }
 global.ThebeAiExportMenu=Object.freeze({mountExportAction});
})(window);
