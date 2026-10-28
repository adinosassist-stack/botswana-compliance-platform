import test from "node:test";
import assert from "node:assert/strict";
import {stagePopSubmission} from "../cloudflare/src/payment-pop-staging-service.js";
const id="11111111-1111-4111-8111-111111111111";
const args={session:{tenantId:id,role:"owner",userId:id},orderId:id,documentId:id,bytes:new Uint8Array([137,80,78,71,13,10,26,10,1]),name:"receipt.png",contentType:"image/png"};
function harness(success=true){let inserts=0,deletes=0;return {env:{POP_UPLOAD_STAGING_ENABLED:"true",EVIDENCE:{put:async()=>({etag:"created"}),delete:async()=>{deletes++}},DB:{prepare(sql){return {bind(){return {first:async()=>({id,tenant_id:id,order_type:"subscription",provider:"manual_bank",status:"pending"}),run:async()=>{inserts++;return {success}}}}}}}},counts:()=>({inserts,deletes})}}
test("staging records pending-only POP metadata",async()=>{const x=harness();const r=await stagePopSubmission(x.env,args);assert.equal(r.scanStatus,"pending");assert.equal(r.subscriptionActivated,false);assert.deepEqual(x.counts(),{inserts:1,deletes:0})});
test("failed POP metadata insertion removes newly quarantined object",async()=>{const x=harness(false);await assert.rejects(stagePopSubmission(x.env,args),/pop_metadata_write_failed/);assert.deepEqual(x.counts(),{inserts:1,deletes:1})});
