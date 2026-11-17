import test from "node:test";
import assert from "node:assert/strict";
import {assessQuotationPrivateVersionReadiness as check}
 from "../scripts/quotation-private-version-readiness-guard.mjs";

const srcHead="47b35ba367a8d8d8125d2bf9b561e602b53f4da1";
function valid(){
 return {
  accountId:"ddd23cab31928a4bb3d4998df9b26d1d",
  mainSha:srcHead,sourceHeadSha:srcHead,
  worker:{id:"bcaaf366ef7349a1a76a3a66735cb3af",
   name:"bw-quotation-auth-private-staging",deployed_on:null,
   subdomain:{enabled:false,previews_enabled:false},
   references:{domains:[],workers:[]}},
  versions:[{id:"cc20de6e-ab08-409f-89a1-390e0eaf5be1",
    main_module:"quotation-private-bootstrap-deny-all.mjs",urls:[]}],
  deployments:[],routes:[],domains:[],versionBindings:[],
  authCounts:[{table:"users",count:0},{table:"memberships",count:0},
    {table:"sessions",count:0}],
  authReadOnlyVerified:true
 };
}
test("read-only evidence qualifies for seeking approval, never deployment",()=>{
 const out=check(valid());
 assert.equal(out.safeForSeparateStagingApprovalRequest,true);
 assert.deepEqual(out.failures,[]);
 for(const k of ["deploymentAuthorized","versionUploadAuthorized",
  "bindingAuthorized","templateUploadAuthorized","customerIssuanceAuthorized",
  "productionAuthorized"])assert.equal(out[k],false);
});
test("absence of identity or independently pinned main source fails",()=>{
 for(const overrides of [
  {mainSha:"0".repeat(40)},{sourceHeadSha:"x"},
  {sourceHeadSha:undefined},{accountId:"different"},
  {worker:{...valid().worker,id:"wrong"}},
  {worker:{...valid().worker,name:"prod-worker"}}
 ])assert.equal(check({...valid(),...overrides}).safeForSeparateStagingApprovalRequest,false);
});
test("reject deployed, exposed or referenced Worker",()=>{
 for(const overrides of [
  {worker:{...valid().worker,deployed_on:"2026-11-17T02:30:00Z"}},
  {worker:{...valid().worker,subdomain:{enabled:true,previews_enabled:false}}},
  {worker:{...valid().worker,subdomain:{enabled:false,previews_enabled:true}}},
  {worker:{...valid().worker,references:{domains:["thebedesk.com"],workers:[]}}},
  {deployments:[{id:"bad"}]},{routes:[{}]},{domains:[{}]}
 ])assert.equal(check({...valid(),...overrides}).safeForSeparateStagingApprovalRequest,false);
});
test("reject missing, extra, wrong or exposed bootstrap versions",()=>{
 for(const versions of [
  [],undefined,[...valid().versions,...valid().versions],
  [{...valid().versions[0],id:"wrong"}],
  [{...valid().versions[0],main_module:"real-service.mjs"}],
  [{...valid().versions[0],urls:["https://example.com"]}]
 ])assert.equal(check({...valid(),versions}).safeForSeparateStagingApprovalRequest,false);
});
test("unknown bindings or missing evidence cannot silently pass",()=>{
 for(const overrides of [
  {versionBindings:[{type:"d1"}]},{versionBindings:undefined},
  {authCounts:undefined},{authReadOnlyVerified:false},
  {authCounts:[{table:"users",count:1},{table:"memberships",count:0},
    {table:"sessions",count:0}]},
  {authCounts:[{table:"users",count:0},{table:"users",count:0},
    {table:"sessions",count:0}]}
 ])assert.equal(check({...valid(),...overrides}).safeForSeparateStagingApprovalRequest,false);
});
test("a missing snapshot never becomes deployment authority",()=>{
 const x=check();
 assert.equal(x.safeForSeparateStagingApprovalRequest,false);
 assert.equal(x.deploymentAuthorized,false);
 assert.ok(x.failures.length>=6);
});
