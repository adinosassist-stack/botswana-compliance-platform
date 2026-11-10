import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAssetStagingExposure,inspectAssetStagingExposure,EXPECTED_ZONES,WORKER} from '../scripts/corporate-assets-v3-private-exposure-attestation.mjs';
const base=()=>({subdomain:{enabled:false,previews_enabled:false},domains:[],
 zones:EXPECTED_ZONES.map(id=>({id})),zoneRoutes:EXPECTED_ZONES.map(zone=>({zone,routes:[]}))});
const denied=(change,reason)=>{
 const x=base();change(x);const y=checkAssetStagingExposure(x);
 assert.equal(y.privateExposureVerified,false);assert.ok(y.errors.includes(reason),JSON.stringify(y.errors));
};
test('private exposure evidence never authorizes release or source',()=>{
 const x=checkAssetStagingExposure(base());
 assert.equal(x.privateExposureVerified,true);
 assert.equal(x.deploymentAuthorized,false);
 assert.equal(x.sourceProvenanceVerified,false);
});
test('subdomain and public preview must both be disabled',()=>{
 denied(x=>x.subdomain.enabled=true,'worker_subdomain_or_preview_enabled');
 denied(x=>x.subdomain.previews_enabled=true,'worker_subdomain_or_preview_enabled');
 denied(x=>x.subdomain={enabled:false},'worker_subdomain_or_preview_enabled');
});
test('custom domains and zone routes prohibit private qualification',()=>{
 denied(x=>x.domains=[{service:WORKER,hostname:'test.example'}],'custom_domain_attached');
 denied(x=>x.zoneRoutes[0].routes=[{script:WORKER,pattern:'example.com/*'}],'worker_zone_route_attached');
});
test('zone inventory must cover all known account zones, once each',()=>{
 denied(x=>x.zones.pop(),'zone_inventory_changed');
 denied(x=>x.zones.push({id:'new-zone'}),'zone_inventory_changed');
 denied(x=>x.zoneRoutes.pop(),'zone_routes_incomplete');
 denied(x=>x.zoneRoutes[1].zone=x.zoneRoutes[0].zone,'zone_routes_incomplete');
});
test('mocked Cloudflare read-only envelope and request coverage',async()=>{
 const x=base(),calls=[];
 const request=async(url,opts)=>{
  calls.push({url,method:opts.method,authorization:opts.headers.authorization});
  let result;
  if(url.endsWith('/subdomain'))result=x.subdomain;
  else if(url.endsWith('/domains'))result=x.domains;
  else if(url.includes('/zones?'))result=x.zones;
  else {const zone=EXPECTED_ZONES.find(id=>url.includes(id));result=x.zoneRoutes.find(y=>y.zone===zone)?.routes;}
  if(!result)throw Error('unknown_mock_url');
  return {ok:true,json:async()=>({success:true,result,...(Array.isArray(result)?{result_info:{page:1,total_pages:1,count:result.length}}:{})})};
 };
 const y=await inspectAssetStagingExposure({token:'synthetic-read-token',accountToken:'synthetic-account-token',request});
 assert.equal(y.privateExposureVerified,true);
 assert.equal(calls.length,5);
 assert.ok(calls.every(c=>c.method==='GET'));
 assert.ok(calls.filter(c=>c.url.endsWith('/domains')||c.url.includes('/zones?')).every(c=>c.authorization==='Bearer synthetic-account-token'));
 assert.ok(calls.filter(c=>!c.url.endsWith('/domains')&&!c.url.includes('/zones?')).every(c=>c.authorization==='Bearer synthetic-read-token'));
});
test('API error, malformed response and partial inventory must fail',async()=>{
 const request=async()=>({ok:false,status:403});
 await assert.rejects(inspectAssetStagingExposure({token:'synthetic',accountToken:'synthetic-account',request}),/cloudflare_exposure_read_failed_worker_subdomain_403/);
 const bad=async()=>({ok:true,json:async()=>({success:false,result:null})});
 await assert.rejects(inspectAssetStagingExposure({token:'synthetic',accountToken:'synthetic-account',request:bad}),/cloudflare_exposure_invalid_response_worker_subdomain/);
 const partial=async url=>({ok:true,json:async()=>({success:true,result:url.endsWith('/subdomain')?{enabled:false,previews_enabled:false}:[],
  result_info:url.endsWith('/subdomain')?undefined:{page:1,total_pages:2,count:0}})});
 await assert.rejects(inspectAssetStagingExposure({token:'synthetic',accountToken:'synthetic-account',request:partial}),/domains_inventory_incomplete/);
});

test('HTTP 403 diagnostics classify each read scope without leaking credentials',async()=>{
 for(const [ending,scope] of [
  ['/subdomain','worker_subdomain'],['/domains','worker_domains'],
  ['/zones?per_page=100','zone_inventory'],['/workers/routes','zone_worker_routes']
 ]){
  const x=base();
  const request=async(url,options)=>{
   assert.equal(options.method,'GET');
   if(url.endsWith(ending))return {ok:false,status:403};
   let result;
   if(url.endsWith('/subdomain'))result=x.subdomain;
   else if(url.endsWith('/domains'))result=x.domains;
   else if(url.includes('/zones?'))result=x.zones;
   else result=[];
   return {ok:true,json:async()=>({success:true,result,...(Array.isArray(result)?{result_info:{page:1,total_pages:1,count:result.length}}:{})})};
  };
  await assert.rejects(inspectAssetStagingExposure({token:'synthetic-secret',accountToken:'synthetic-account-secret',request}),e=>{
   assert.equal(e.message,'cloudflare_exposure_read_failed_'+scope+'_403');
   assert.ok(!e.message.includes('synthetic-secret'));
   return true;
  });
 }
});

test('missing separate account audit credential fails closed before network',async()=>{
 let calls=0;
 await assert.rejects(inspectAssetStagingExposure({token:'synthetic-zone',request:async()=>{calls++;throw Error('unexpected_network')}}),/dedicated_account_inventory_read_token_required/);
 assert.equal(calls,0);
});
