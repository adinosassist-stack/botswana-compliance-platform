(function(global){
 'use strict';
 function createLoader({capability,fetcher=global.fetch?.bind(global)}={}){
  if(capability?.enabled!==true||capability?.authenticated!==true||capability?.tenantAuthorized!==true||typeof fetcher!=='function')return null;
  return async()=>{
   const response=await fetcher('/api/assets/insurance',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{accept:'application/json'}});
   if(!response?.ok||!(response.headers?.get('content-type')||'').toLowerCase().includes('application/json'))throw new Error('insurance_unavailable');
   const data=await response.json();if(!data||!Array.isArray(data.policies)||data.policies.length>100)throw new Error('invalid_insurance_response');
   return {policies:data.policies};
  };
 }
 global.ThebeAssetsInsuranceClient=Object.freeze({createLoader});
})(window);
