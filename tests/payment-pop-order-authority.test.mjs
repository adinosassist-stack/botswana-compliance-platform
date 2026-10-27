import test from "node:test";
import assert from "node:assert/strict";
import {authorizePopSubmission} from "../cloudflare/src/payment-pop-order-authority.js";
const tenant="tenant-a",orderId="order-a";
function db(row){
 let bound;
 return {prepare(sql){assert.match(sql,/WHERE id=\? AND tenant_id=\?/);return {bind(...values){bound=values;return {async first(){assert.deepEqual(bound,[orderId,tenant]);return row}}}}}};
}
const allowed={id:orderId,tenant_id:tenant,order_type:"subscription",provider:"manual_bank",status:"pending"};
test("requires owner and tenant-scoped pending manual-bank subscription order",async()=>{
 assert.deepEqual(await authorizePopSubmission(db(allowed),{tenantId:tenant,orderId,actorRole:"owner"}),{tenantId:tenant,orderId});
 for(const actorRole of ["manager","member",undefined])await assert.rejects(authorizePopSubmission(db(allowed),{tenantId:tenant,orderId,actorRole}),/forbidden/);
 for(const row of [null,{...allowed,tenant_id:"tenant-b"},{...allowed,provider:"card"},{...allowed,status:"succeeded"},{...allowed,order_type:"invoice"}])
  await assert.rejects(authorizePopSubmission(db(row),{tenantId:tenant,orderId,actorRole:"owner"}));
});
