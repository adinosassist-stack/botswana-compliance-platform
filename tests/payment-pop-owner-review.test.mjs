import test from "node:test";
import assert from "node:assert/strict";
import {listPopForPlatformOwner,markPopScanResult,readCleanPopForOwner} from "../cloudflare/src/payment-pop-owner-review.js";
const id="11111111-1111-4111-8111-111111111111";
test("POP review queue denies unauthorized access",async()=>{
 await assert.rejects(listPopForPlatformOwner({DB:{prepare(){throw Error("must not query")}}},{actor:{platformOwner:false},orderId:id}),/forbidden/);
});
test("scanner calls require qualified configuration and signed evidence",async()=>{
 const DB={prepare(){throw Error('must not query')}};
 for(const scannerAuthenticated of [true,false])await assert.rejects(markPopScanResult({DB},{documentId:id,scanStatus:'clean',scannerAuthenticated}),/pop_scanner_forbidden/);
});
test("owner cannot view pending or cross-tenant POP",async()=>{
 const env={APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',POP_SCAN_STAGING_ENABLED:'true',POP_OWNER_RETRIEVAL_STAGING_ENABLED:'true',POP_SCAN_SECRET:'scan-fixture-secret-'.repeat(3),POP_SCANNER_ID:'local-scanner',DB:{prepare(){return {bind(){return {first:async()=>({tenant_id:id,scan_status:"pending",deleted_at:null})}}}}},EVIDENCE:{get(){throw Error("no file access")}}};
 await assert.rejects(readCleanPopForOwner(env,{actor:{platformOwner:true,userId:id},documentId:id,orderId:id,tenantId:id}),/not_reviewable/);
});
test('a plain scannerAuthenticated boolean cannot bless a receipt',async()=>{
 const DB={prepare(){return {bind(){return {run:async()=>({meta:{changes:1}})}}}}};
 await assert.rejects(markPopScanResult({DB,APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',POP_SCAN_STAGING_ENABLED:'true',POP_SCAN_SECRET:'scan-fixture-secret-'.repeat(3),POP_SCANNER_ID:'local-scanner'},{documentId:id,scanStatus:'clean',scannerAuthenticated:true}),/pop_scanner_forbidden/);
});
