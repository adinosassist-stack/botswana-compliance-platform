/* Thebe Assets: fail-closed browser adapter for a host-authorized route.
 * No tenant IDs or user-supplied URLs; the server must authenticate every request.
 */
(function(global){
 "use strict";
 const PATH="/api/assets/summary";
 function createSummaryLoader({capability,fetcher=global.fetch?.bind(global)}={}){
  if(capability?.enabled!==true||capability?.authenticated!==true||
     capability?.tenantAuthorized!==true||typeof fetcher!=="function")return null;
  return async function loadSummary(){
   const response=await fetcher(PATH,{method:"GET",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{"accept":"application/json"}});
   if(!response||response.ok!==true)throw new Error("assets_summary_unavailable");
   const type=response.headers?.get("content-type")||"";
   if(!type.toLowerCase().includes("application/json"))throw new Error("assets_summary_invalid_response");
   const body=await response.json();
   const data=body?.data;
   if(!data||!Number.isSafeInteger(data.totalAssets)||data.totalAssets<0||
      typeof data.bookValueBwp!=="number"||!Number.isFinite(data.bookValueBwp)||data.bookValueBwp<0||
      !Number.isSafeInteger(data.maintenanceDue)||data.maintenanceDue<0||
      !Number.isSafeInteger(data.insuranceDue)||data.insuranceDue<0)
     throw new Error("assets_summary_invalid_response");
   return data;
  };
 }
 global.ThebeAssetsSummaryClient=Object.freeze({createSummaryLoader});
})(window);
