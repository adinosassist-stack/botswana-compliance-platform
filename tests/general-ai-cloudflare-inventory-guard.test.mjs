import test from "node:test";
import assert from "node:assert/strict";
import {verifyInertPrivateQueueInventory as verify} from "../scripts/general-ai-cloudflare-inventory-guard.mjs";
const fixture=()=>({
 queues:[{queue_name:"bw-general-ai-private-acceptance-queue",producers_total_count:0,producers:[],consumers_total_count:1,consumers:[{script:"bw-general-ai-private-queue-acceptance",type:"worker",settings:{batch_size:1,max_retries:0,max_concurrency:1}}]}],
 worker:{bindings:[
 {name:"PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED",type:"plain_text",text:"false"},
 {name:"PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED",type:"plain_text",text:"false"},
 {name:"PRIVATE_AI_LEDGER_ISOLATION_VERIFIED",type:"plain_text",text:"false"},
 {name:"PRIVATE_AI_NONCE_DB",type:"d1",database_id:"71e2d394-7dec-4878-bdc8-afe8f73cf541"},
 {name:"STAGING_AI",type:"service",service:"bw-general-ai-staging",environment:"production"}]},
 d1:[{success:true,results:[{name:"ai_private_queue_nonce_claims",type:"table",sql:"CREATE TABLE ai_private_queue_nonce_claims (claim_hash TEXT PRIMARY KEY NOT NULL, source_sha TEXT NOT NULL)"}],meta:{changes:0,changed_db:false}}]
});
test("verified inert inventory does not imply live acceptance or isolated service",()=>{
 const result=verify(fixture());assert.equal(result.flagsDisabled,true);assert.equal(result.liveDeliveryVerified,false);assert.equal(result.serviceIsolationAttested,false);
});
test("rejects unexpected producer, consumer and retry settings",()=>{
 for(const mutate of [
 x=>x.queues[0].producers_total_count=1,
 x=>x.queues[0].consumers[0].settings.max_retries=2,
 x=>x.queues[0].consumers[0].settings.max_concurrency=2,
 x=>x.queues[0].consumers[0].script="unknown-worker"
 ]){const x=fixture();mutate(x);assert.throws(()=>verify(x));}
});
test("rejects enabled flags, wrong D1 and missing nonce schema",()=>{
 for(const mutate of [
 x=>x.worker.bindings[0].text="true",
 x=>x.worker.bindings[3].database_id="wrong",
 x=>x.d1[0].results=[],
 x=>x.d1[0].meta.changed_db=true,
 x=>x.worker.bindings.push({...x.worker.bindings[0]})
 ]){const x=fixture();mutate(x);assert.throws(()=>verify(x));}
});
test("rejects wrong service target",()=>{const x=fixture();x.worker.bindings[4].service="customer-production";assert.throws(()=>verify(x))});
