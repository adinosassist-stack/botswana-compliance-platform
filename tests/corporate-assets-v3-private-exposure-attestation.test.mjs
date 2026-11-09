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
  calls.push({url,method:opts.method});
  let result;
  if(url.endsWith('/subdomain'))result=x.subdomain;
  else if(url.endsWith('/domains'))result=x.domains;
  else if(url.includes('/zones?'))result=x.zones;
  else {const zone=EXPECTED_ZONES.find(id=>url.includes(id));result=x.zoneRoutes.find(y=>y.zone===zone)?.routes;}
  if(!result)throw Error('unknown_mock_url');
  return {ok:true,json:async()=>({success:true,result,...(Array.isArray(result)?{result_info:{page:1,total_pages:1,count:result.length}}:{})})};
 };
 const y=await inspectAssetStagingExposure({token:'synthetic-read-token',request});
 assert.equal(y.privateExposureVerified,true);
 assert.equal(calls.length,5);
 assert.ok(calls.every(c=>c.method==='GET'));
});
test('API error, malformed response and partial inventory must fail',async()=>{
 const request=async()=>({ok:false,status:403});
 await assert.rejects(inspectAssetStagingExposure({token:'synthetic',request}),/cloudflare_exposure_read_failed_403/);
 const bad=async()=>({ok:true,json:async()=>({success:false,result:null})});
 await assert.rejects(inspectAssetStagingExposure({token:'synthetic',request:bad}),/cloudflare_exposure_invalid_response/);
 const partial=async url=>({ok:true,json:async()=>({success:true,result:url.endsWith('/subdomain')?{enabled:false,previews_enabled:false}:[],
  result_info:url.endsWith('/subdomain')?undefined:{page:1,total_pages:2,count:0}})});
 await assert.rejects(inspectAssetStagingExposure({token:'synthetic',request:partial}),/domains_inventory_incomplete/);
});
