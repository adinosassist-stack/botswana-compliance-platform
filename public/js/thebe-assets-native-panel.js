/* Thebe Assets native Workspace panel. Additive, default-off, no duplicate shell or dock. */
(function(global){
 "use strict";
 const currency=new Intl.NumberFormat("en-BW",{style:"currency",currency:"BWP",maximumFractionDigits:0});
 const safeCount=value=>Number.isInteger(value)&&value>=0?value:0;
 function create(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=String(text);return el}
 function mount({host,capability,loadSummary,onOpenRegister,onOpenMaintenance}={}){
  if(!host||capability?.enabled!==true||capability?.authenticated!==true||capability?.tenantAuthorized!==true||typeof loadSummary!=="function")return null;
  if(host.querySelector('[data-thebe-assets-native="1"]'))return host.querySelector('[data-thebe-assets-native="1"]');
  const section=create("section","thebe-assets-native");section.dataset.thebeAssetsNative="1";section.setAttribute("aria-label","Corporate assets");
  const head=create("div","thebe-assets-native-head");head.append(create("h3",null,"Corporate assets"));
  const refresh=create("button","thebe-assets-native-refresh","Refresh");refresh.type="button";head.append(refresh);
  const status=create("p","thebe-assets-native-state","Loading assets…");status.setAttribute("role","status");
  const figures=create("div","thebe-assets-native-figures");
  const definitions=[["Assets","totalAssets",false],["Book value","bookValueBwp",true],["Maintenance due","maintenanceDue",false],["Insurance due","insuranceDue",false]];
  const slots=new Map();
  for(const [label,key] of definitions){const card=create("div","thebe-assets-native-card");card.append(create("span",null,label));const value=create("strong",null,"—");card.append(value);figures.append(card);slots.set(key,value)}
  const actions=create("div","thebe-assets-native-actions");
  for(const [label,callback] of [["Asset register",onOpenRegister],["Maintenance",onOpenMaintenance]]){
    if(typeof callback==="function"){const button=create("button",null,label);button.type="button";button.addEventListener("click",callback);actions.append(button)}
  }
  section.append(head,figures,status,actions);host.append(section);
  let inFlight=false;
  async function refreshData(){
   if(inFlight)return;
   inFlight=true;refresh.disabled=true;status.textContent="Loading assets…";
   try{
    const data=await loadSummary();
    if(!data||typeof data!=="object"||typeof data.bookValueBwp!=="number"||!Number.isFinite(data.bookValueBwp)||data.bookValueBwp<0||
      !Number.isInteger(data.totalAssets)||data.totalAssets<0||!Number.isInteger(data.maintenanceDue)||data.maintenanceDue<0||!Number.isInteger(data.insuranceDue)||data.insuranceDue<0)throw new Error("invalid_summary");
    for(const [label,key,money] of definitions){const value=data[key];slots.get(key).textContent=money?currency.format(value):String(safeCount(value))}
    status.textContent="Asset summary updated";
   }catch{for(const slot of slots.values())slot.textContent="—";status.textContent="Asset data unavailable";}
   finally{inFlight=false;refresh.disabled=false}
  }
  refresh.addEventListener("click",refreshData);void refreshData();
  return section;
 }
 global.ThebeAssetsNative=Object.freeze({mount});
})(window);
