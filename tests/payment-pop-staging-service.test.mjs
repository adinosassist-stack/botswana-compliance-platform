import test from "node:test";
import assert from "node:assert/strict";
import {stagePopSubmission} from "../cloudflare/src/payment-pop-staging-service.js";
const id="11111111-1111-4111-8111-111111111111",bytes=new Uint8Array([137,80,78,71,13,10,26,10,1]);
function setup(role="owner",tenant=id,provider="manual_bank"){
 let writes=0;
 const env={POP_UPLOAD_STAGING_ENABLED:"true",EVIDENCE:{put:async()=>{writes++}},DB:{prepare(sql){
  assert.match(sql,/tenant_id=\?/);
  return {bind(orderId,tenantId){return {first:async()=>({id:orderId,tenant_id:tenant,order_type:"subscription",provider,status:"pending"})}}};
 }}};
 return {env,getWrites:()=>writes,session:{tenantId:tenant,role,userId:id}};
}
const opts={orderId:id,documentId:id,bytes,name:"receipt.png",contentType:"image/png"};
test("authenticated tenant owner can stage a receipt without activating plan",async()=>{
 const x=setup();
 const result=await stagePopSubmission(x.env,{...opts,session:x.session});
 assert.equal(x.getWrites(),1);assert.equal(result.scanStatus,"pending");
 assert.equal(result.reviewable,false);assert.equal(result.bankFundsConfirmed,false);assert.equal(result.subscriptionActivated,false);
});
test("unauthenticated, nonowner, disabled and invalid files never write",async()=>{
 const x=setup("member");
 await assert.rejects(stagePopSubmission(x.env,{...opts,session:x.session}),/forbidden/);assert.equal(x.getWrites(),0);
 await assert.rejects(stagePopSubmission(x.env,{...opts,session:null}),/unauthenticated/);
 const y=setup();await assert.rejects(stagePopSubmission(y.env,{...opts,name:"receipt.exe",session:y.session}),/invalid_pop_type/);assert.equal(y.getWrites(),0);
 y.env.POP_UPLOAD_STAGING_ENABLED="false";await assert.rejects(stagePopSubmission(y.env,{...opts,session:y.session}),/disabled/);
});
