/* Fixed same-origin read-only endpoint. Server must authorize company scope. */
(function(global){
 'use strict';
 function createLoader({capability,fetcher=global.fetch?.bind(global)}={}){
  if(capability?.enabled!==true||capability?.authenticated!==true||capability?.tenantAuthorized!==true||typeof fetcher!=='function')return null;
  return async()=>{
   const response=await fetcher('/api/assets/maintenance',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{accept:'application/json'}});
   if(!response?.ok||!(response.headers?.get('content-type')||'').toLowerCase().includes('application/json'))throw new Error('maintenance_unavailable');
   const body=await response.json();if(!body||!Array.isArray(body.events)||body.events.length>100)throw new Error('invalid_maintenance_response');
   return {events:body.events};
  };
 }
 global.ThebeAssetsMaintenanceClient=Object.freeze({createLoader});
})(window);
