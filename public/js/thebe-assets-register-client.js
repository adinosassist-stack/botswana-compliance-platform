/* Authenticated same-origin asset register loader; no client-supplied company ID. */
(function(global){
 'use strict';
 function createLoader({capability,fetcher=global.fetch?.bind(global)}={}){
  if(capability?.enabled!==true||capability?.authenticated!==true||capability?.tenantAuthorized!==true||typeof fetcher!=='function')return null;
  return async function loadAssets(){
   const response=await fetcher('/api/assets',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{accept:'application/json'}});
   if(!response?.ok||!(response.headers?.get('content-type')||'').toLowerCase().includes('application/json'))throw new Error('assets_unavailable');
   const data=await response.json();
   if(!data||!Array.isArray(data.assets)||data.assets.length>100)throw new Error('invalid_assets_response');
   return {assets:data.assets};
  };
 }
 global.ThebeAssetsRegisterClient=Object.freeze({createLoader});
})(window);
