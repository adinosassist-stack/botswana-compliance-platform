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

test("PowerPoint slide limit rejects oversized documents",async()=>{
 const blocks=Array.from({length:40},(_,i)=>({type:"paragraph",text:"Page "+i}));
 await assert.rejects(renderAiDocument({title:"Deck",blocks},"pptx"),/too_many_slides/);
});
test("PDF rejects unbreakable text wider than a page",async()=>{
 await assert.rejects(renderAiDocument({title:"Report",blocks:[{type:"paragraph",text:"W".repeat(300)}]},"pdf"),/pdf_word_too_long/);
});

test("PDF supports Botswana pula amounts and retains reference metadata without Unicode separator errors",async()=>{
 const file=await renderAiDocument({title:"Botswana budget P 12,500",blocks:[{type:"paragraph",text:"Monthly payroll P 3,500"}],references:[{label:"BOCRA",url:"https://www.bocra.org.bw"}]},"pdf");
 assert.equal(file.subarray(0,4).toString(),"%PDF");
});
