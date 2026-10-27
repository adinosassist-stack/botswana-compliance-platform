import test from "node:test";
import assert from "node:assert/strict";
import {recordPendingPop} from "../cloudflare/src/payment-pop-metadata.js";
test("POP metadata writes only pending receipt records and never payment status",async()=>{
 let sql,params;
 const db={prepare(s){sql=s;return {bind(...p){params=p;return {run:async()=>({success:true})}}}}};
 const r=await recordPendingPop(db,{documentId:"doc",tenantId:"tenant",orderId:"order",objectKey:"payment-pop/quarantine/tenant/order/doc",name:"receipt.png",contentType:"image/png",bytes:12,userId:"user"});
 assert.equal(r.scanStatus,"pending");
 assert.match(sql,/INSERT INTO payment_pop_documents/);
 assert.match(sql,/'pending'/);
 assert.doesNotMatch(sql,/payment_fulfillments|UPDATE payment_orders|subscriptions/i);
 assert.equal(params.length,8);
});
test("missing authority scope and bad storage keys fail closed",async()=>{
 await assert.rejects(recordPendingPop(null,{}),/invalid/);
 await assert.rejects(recordPendingPop({prepare(){}},{documentId:"doc",tenantId:"tenant",orderId:"order",objectKey:"https://public.test/file",userId:"user"}),/invalid/);
});
