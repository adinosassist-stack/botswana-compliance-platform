import assert from "node:assert/strict";
import {test} from "node:test";
import Module from "node:module";
import {renderAiDocument} from "../server/ai-document-renderer.js";
test("text-only PPTX generation succeeds when vulnerable image-size imports are denied",async()=>{
 const previous=Module._load;
 let blockedAttempts=0;
 Module._load=function(specifier,...rest){
  if(typeof specifier==="string"&&(/^image-size(?:$|\/)/.test(specifier)||specifier==="image-size-next")){
   blockedAttempts++;
   throw new Error("risky_image_decoder_import_blocked");
  }
  return Reflect.apply(previous,this,[specifier,...rest]);
 };
 try{
  const data=await renderAiDocument({title:"Plain text",blocks:[{type:"paragraph",text:"P 500"}],references:[]},"pptx");
  assert.equal(Buffer.isBuffer(data),true);
  assert.equal(data.subarray(0,4).toString("hex"),"504b0304");
  assert.equal(blockedAttempts,0,"PPTX renderer unexpectedly attempted to import image decoder");
 }finally{Module._load=previous}
});
