import test from "node:test";
import assert from "node:assert/strict";
import {popQuarantineKey,popOwnerReadAllowed} from "../cloudflare/src/payment-pop-storage-boundary.js";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",c="33333333-3333-4333-8333-333333333333";
test("POP quarantine key is private and scoped",()=>{
 assert.equal(popQuarantineKey({tenantId:a,orderId:b,documentId:c}),"payment-pop/quarantine/"+a+"/"+b+"/"+c);
 assert.throws(()=>popQuarantineKey({tenantId:"../other",orderId:b,documentId:c}),/invalid_pop_scope/);
});
test("POP read requires platform owner, tenant match and clean status",()=>{
 const good={platformOwner:true,tenantMatches:true,scanStatus:"clean",deletedAt:null};
 assert.equal(popOwnerReadAllowed(good),true);
 for(const mutation of [{platformOwner:false},{tenantMatches:false},{scanStatus:"pending"},{scanStatus:"blocked"},{deletedAt:"2026-10-27"}])
  assert.equal(popOwnerReadAllowed({...good,...mutation}),false);
});
