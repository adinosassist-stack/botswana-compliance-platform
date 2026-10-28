import test from "node:test";
import assert from "node:assert/strict";
import {listPopForPlatformOwner,markPopScanResult,readCleanPopForOwner} from "../cloudflare/src/payment-pop-owner-review.js";
const id="11111111-1111-4111-8111-111111111111";
test("POP review queue denies unauthorized access",async()=>{
 await assert.rejects(listPopForPlatformOwner({DB:{prepare(){throw Error("must not query")}}},{actor:{platformOwner:false},orderId:id}),/forbidden/);
});
test("scanner updates are pending-only and never payment settlement",async()=>{
 let sql,values;
 const db={prepare(s){sql=s;return {bind(...p){values=p;return {run:async()=>({meta:{changes:1}})}}}}};
 const r=await markPopScanResult({DB:db},{documentId:id,scanStatus:"clean",scannerAuthenticated:true});
 assert.equal(r.bankFundsConfirmed,false);
 assert.match(sql,/scan_status='pending'/);
 assert.doesNotMatch(sql,/payment_orders|subscriptions|fulfillment/i);
 assert.deepEqual(values,["clean",id]);
 await assert.rejects(markPopScanResult({DB:db},{documentId:id,scanStatus:"clean",scannerAuthenticated:false}),/forbidden/);
});
test("owner cannot view pending or cross-tenant POP",async()=>{
 const env={DB:{prepare(){return {bind(){return {first:async()=>({tenant_id:id,scan_status:"pending",deleted_at:null})}}}}},EVIDENCE:{get(){throw Error("no file access")}}};
 await assert.rejects(readCleanPopForOwner(env,{actor:{platformOwner:true},documentId:id,orderId:id,tenantId:id}),/not_reviewable/);
});
