import test from "node:test";
import assert from "node:assert/strict";
import {quarantinePop} from "../cloudflare/src/payment-pop-quarantine-store.js";
const id="11111111-1111-4111-8111-111111111111";
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1]);
const opts={tenantId:id,orderId:id,documentId:id,bytes,name:"receipt.png",contentType:"image/png"};
test("POP quarantine refuses writes when disabled",async()=>{
 let calls=0;const env={EVIDENCE:{put:async()=>{calls++}}};
 await assert.rejects(quarantinePop(env,opts),/disabled/);
 assert.equal(calls,0);
});
test("enabled quarantine stores only pending objects, not payment actions",async()=>{
 let captured;const env={POP_UPLOAD_STAGING_ENABLED:"true",EVIDENCE:{put:async(...args)=>{captured=args}}};
 const result=await quarantinePop(env,opts);
 assert.match(result.key,/^payment-pop\/quarantine\//);
 assert.equal(result.scanStatus,"pending");
 assert.equal(captured[2].httpMetadata.contentType,"application/octet-stream");
 assert.equal(captured[2].customMetadata.scanStatus,"pending");
});
