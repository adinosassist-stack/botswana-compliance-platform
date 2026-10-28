import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const start=worker.indexOf('if(url.pathname==="/api/payments/manual-bank/pop/stage"');
const end=worker.indexOf('if(url.pathname==="/api/payments/manual-bank/submit"',start);
const route=worker.slice(start,end);
test("POP HTTP staging remains default-off and session-scoped",()=>{
 assert.ok(start>0&&end>start);
 assert.match(route,/POP_UPLOAD_STAGING_ENABLED/);
 assert.match(route,/roleAllowed\(a,"owner"\)/);
 assert.match(route,/tenantId:a\.tenant_id,role:a\.role,userId:a\.user_id/);
 assert.match(route,/stagePopSubmission/);
 assert.match(route,/const requestKey=String\(req.headers.get\("idempotency-key"\)/);
 assert.ok(route.indexOf("validPopRequestKey(requestKey)")<route.indexOf("readBytesBounded(req"));
 assert.match(route,/const documentId=id\(\)/);
 assert.doesNotMatch(route,/req\.headers\.get\("x-pop-document-id"\)/);
 assert.match(route,/PAYMENT_ORDER_ID_RE\.test\(orderId\)/);
 assert.match(route,/readBytesBounded\(req,\{maxBytes:3670016\}\)/);
});
test("POP staging cannot claim payment receipt or activate plans",()=>{
 assert.match(route,/scanStatus:result.scanStatus,reviewable:false/);
 assert.doesNotMatch(route,/approveManual|activateSubscription|setSubscriptionAccess|payment_fulfillments|UPDATE payment_orders/i);
});
