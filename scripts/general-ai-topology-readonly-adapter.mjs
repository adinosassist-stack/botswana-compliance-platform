import assert from "node:assert/strict";
import {verifyGeneralAiStagingTopology} from "./general-ai-staging-topology-guard.mjs";
const ACCOUNT="ddd23cab31928a4bb3d4998df9b26d1d";
const STAGING="bw-general-ai-staging";
const CONSUMER="bw-general-ai-private-queue-acceptance";
/** Cloudflare read-only topology inspection. Never returns reviewer or live acceptance attestation. */
export function createGeneralAiTopologyReadOnlyAdapter({client,accountId,zoneId}={}){
 assert.equal(accountId,ACCOUNT,"wrong Cloudflare account");
 assert.match(zoneId??"",/^[a-f0-9]{32}$/,"explicit zone ID required");
 assert.equal(typeof client?.request,"function","read-only Cloudflare transport required");
 const get=async path=>{
  const response=await client.request({method:"GET",path});
  assert.ok(response?.success!==false,"Cloudflare request failed");
  const info=response?.result_info;
  if(info){assert.equal(info.page,1,"unexpected inventory page");assert.ok(info.total_pages===undefined||info.total_pages===1,"paginated inventory incomplete");}
  assert.ok(response?.result!==undefined,"missing Cloudflare result");
  return response.result;
 };
 const prefix="/accounts/"+ACCOUNT;
 return Object.freeze({async readTopology(){
  const [staging,consumer,databases,domains,routes]=await Promise.all([
   get(prefix+"/workers/scripts/"+STAGING+"/settings"),
   get(prefix+"/workers/scripts/"+CONSUMER+"/settings"),
   get(prefix+"/d1/database?per_page=100"),
   get(prefix+"/workers/domains"),
   get("/zones/"+zoneId+"/workers/routes")
  ]);
  const snapshot={stagingBindings:staging?.bindings,queueBindings:consumer?.bindings,databases,routes,domains};
  const evidence=verifyGeneralAiStagingTopology(snapshot);
  return Object.freeze({snapshot,evidence});
 }});
}
