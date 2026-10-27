import assert from "node:assert/strict";
import {test} from "node:test";
import {renderAiDocument} from "../server/ai-document-renderer.js";
import {hasExpectedAiExportSignature} from "../server/ai-export-artifact-signature.js";
const model={title:"Thebe export qualification",blocks:[
 {type:"heading",text:"Summary"},
 {type:"paragraph",text:"Monthly revenue P 3,500"},
 {type:"bullet",text:"Evidence reviewed"}
],references:[{label:"Reference",url:"https://example.org/report"}]};
test("actual renderer output matches each export container guard",async()=>{
 for(const format of ["pdf","docx","pptx"]){
  const output=await renderAiDocument(model,format);
  assert.equal(Buffer.isBuffer(output),true);
  assert.equal(hasExpectedAiExportSignature(output,format),true,format);
  for(const wrong of ["pdf","docx","pptx"].filter(x=>x!==format)){
   assert.equal(hasExpectedAiExportSignature(output,wrong),false,format+" spoofed as "+wrong);
  }
 }
});
