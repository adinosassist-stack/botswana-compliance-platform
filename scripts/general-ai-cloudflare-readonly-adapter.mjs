import assert from "node:assert/strict";
import {verifyInertPrivateQueueInventory} from "./general-ai-cloudflare-inventory-guard.mjs";
/** Read-only Cloudflare inventory adapter. Never enables, publishes or invents live receipts. */
export function createPrivateQueueReadOnlyAdapter({client,accountId}={}){
 assert.equal(accountId,"ddd23cab31928a4bb3d4998df9b26d1d","wrong Cloudflare account");
 assert.equal(typeof client?.request,"function","read-only Cloudflare transport required");
 const prefix="/accounts/"+accountId;
 const request=async(path,method="GET",body)=>{
  assert.ok(path.startsWith(prefix+"/"),"cross-account path forbidden");
  assert.ok(method==="GET"||(method==="POST"&&path.endsWith("/query")),"mutations forbidden");
  if(method==="POST")assert.deepEqual(body,{sql:"SELECT name, type, sql FROM sqlite_master WHERE type='table' AND name='ai_private_queue_nonce_claims'"},"only fixed schema query allowed");
  const response=await client.request({method,path,...(body?{body}:{})});
  assert.ok(response?.success!==false,"Cloudflare API request failed");
  return response?.result??response;
 };
 return Object.freeze({
  async readInventory(){
   const queues=await request(prefix+"/queues");
   const worker=await request(prefix+"/workers/scripts/bw-general-ai-private-queue-acceptance/settings");
   const d1=await request(prefix+"/d1/database/71e2d394-7dec-4878-bdc8-afe8f73cf541/query","POST",{sql:"SELECT name, type, sql FROM sqlite_master WHERE type='table' AND name='ai_private_queue_nonce_claims'"});
   const snapshot={queues,worker,d1};
   verifyInertPrivateQueueInventory(snapshot);
   return snapshot;
  }
 });
}
