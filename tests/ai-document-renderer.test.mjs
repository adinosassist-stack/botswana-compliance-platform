import assert from "node:assert/strict";
import {test} from "node:test";
import {renderAiDocument} from "../server/ai-document-renderer.js";
const model={title:"Thebe report",blocks:[{type:"heading",text:"Summary"},{type:"paragraph",text:"Operational findings"}],references:[{label:"Reference",url:"https://example.org/report"}]};
test("real renderers emit PDF and Office file signatures",async()=>{
 for(const [format,signature] of [["pdf","%PDF"],["docx","PK"],["pptx","PK"]]){
   const file=await renderAiDocument(model,format);
   assert(Buffer.isBuffer(file));assert(file.length>200);
   assert.equal(file.subarray(0,signature.length).toString(),signature);
 }
});
test("renderer refuses unsupported formats and invalid document models",async()=>{
 await assert.rejects(renderAiDocument(model,"exe"),/unsupported_format/);
 await assert.rejects(renderAiDocument({...model,blocks:[]},"pdf"),/invalid_document/);
});
test("PDF rejects unsupported Unicode instead of silently corrupting text",async()=>{
 await assert.rejects(renderAiDocument({...model,title:"Pula ₱"},"pdf"),/pdf_unicode_font_required/);
});
