import test from "node:test";
import assert from "node:assert/strict";
import {recordPendingPop} from "../cloudflare/src/payment-pop-metadata.js";
const uuid="11111111-1111-4111-8111-111111111111";
test("POP metadata writes only pending receipt records and never payment status",async()=>{
 let sql,params;
 const db={prepare(s){sql=s;return {bind(...p){params=p;return {run:async()=>({success:true})}}}}};
 const r=await recordPendingPop(db,{documentId:uuid,tenantId:uuid,orderId:uuid,objectKey:"payment-pop/quarantine/"+uuid+"/"+uuid+"/"+uuid,name:"receipt.png",contentType:"image/png",bytes:12,userId:"user"});
 assert.equal(r.scanStatus,"pending");
 assert.match(sql,/INSERT INTO payment_pop_documents/);
 assert.match(sql,/'pending'/);
 assert.doesNotMatch(sql,/payment_fulfillments|UPDATE payment_orders|subscriptions/i);
 assert.equal(params.length,10);
});
test("missing authority scope and bad storage keys fail closed",async()=>{
 await assert.rejects(recordPendingPop(null,{}),/invalid/);
 await assert.rejects(recordPendingPop({prepare(){}},{documentId:"doc",tenantId:"tenant",orderId:"order",objectKey:"https://public.test/file",userId:"user"}),/invalid/);
});

test("POP metadata rejects a key associated with another tenant or order",async()=>{
 const db={prepare(){throw Error("must not write")}};
 await assert.rejects(recordPendingPop(db,{documentId:uuid,tenantId:uuid,orderId:uuid,objectKey:"payment-pop/quarantine/other/order/doc",userId:"user"}),/pop_metadata_invalid/);
});

for(const field of ['tenantId','orderId','documentId'])test('POP metadata rejects a valid UUID key with mismatched '+field,async()=>{
 const other="22222222-2222-4222-8222-222222222222";
 const scope={documentId:uuid,tenantId:uuid,orderId:uuid};
 const keyScope={...scope,[field]:other};
 const objectKey=`payment-pop/quarantine/${keyScope.tenantId}/${keyScope.orderId}/${keyScope.documentId}`;
 await assert.rejects(recordPendingPop({prepare(){throw Error('must not write')}},{...scope,objectKey,userId:'user'}),/pop_metadata_invalid/);
});
