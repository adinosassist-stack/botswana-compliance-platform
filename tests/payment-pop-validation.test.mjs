import test from "node:test";
import assert from "node:assert/strict";
import {validatePopUpload,popViewPermitted,MAX_POP_BYTES} from "../cloudflare/src/payment-pop-validation.js";
test("accepted types require matching file signatures",()=>{
 const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
 assert.deepEqual(validatePopUpload(png,"proof.png","image/png"),{bytes:9,contentType:"image/png",scanStatus:"pending"});
 assert.throws(()=>validatePopUpload(png,"proof.pdf","application/pdf"),/signature/);
 assert.throws(()=>validatePopUpload(png,"proof.exe","image/png"),/type/);
 assert.throws(()=>validatePopUpload(png,"../proof.png","image/png"),/name/);
 assert.throws(()=>validatePopUpload(new Uint8Array(MAX_POP_BYTES+1),"proof.png","image/png"),/size/);
});
test("only clean, nondeleted POP can be considered for viewing",()=>{
 assert.equal(popViewPermitted({scan_status:"pending"}),false);
 assert.equal(popViewPermitted({scan_status:"blocked"}),false);
 assert.equal(popViewPermitted({scan_status:"clean",deleted_at:"2026-10-27"}),false);
 assert.equal(popViewPermitted({scan_status:"clean",deleted_at:null}),true);
});


test("POP receipt names reject invisible Unicode, bidi overrides, padded and decomposed spelling",()=>{
 const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
 for(const name of [
  "receipt\u200b.png", "receipt\u202e.png", "receipt\u2066.png",
  "receipt\ufeff.png", "receipt\u0000.png", " receipt.png",
  "receipt.png ", "cafe\u0301.png", null, 12, {toString:()=> "receipt.png"}
 ]){
  assert.throws(()=>validatePopUpload(png,name,"image/png"),/invalid_pop_name/);
 }
 for(const contentType of [null,12,{}," image/png","image/png "]){
  assert.throws(()=>validatePopUpload(png,"receipt.png",contentType),/invalid_pop_type/);
 }
 assert.deepEqual(validatePopUpload(png,"caf\u00e9.png","IMAGE/PNG"),
  {bytes:9,contentType:"image/png",scanStatus:"pending"});
});
