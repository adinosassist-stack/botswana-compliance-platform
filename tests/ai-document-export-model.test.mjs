import assert from "node:assert/strict";
import {test} from "node:test";
import {validateExportDocument} from "../server/ai-document-export-model.js";
const model={title:"Botswana research",blocks:[{type:"heading",text:"Overview"},{type:"paragraph",text:"Research findings"}],references:[{label:"Source",url:"https://example.org/report"}]};
test("normalizes a bounded document with HTTPS citations",()=>{
 const result=validateExportDocument(model);
 assert.equal(result.ok,true);assert.equal(result.value.blocks.length,2);
 assert.equal(result.value.references[0].url,"https://example.org/report");
});
test("rejects malformed, oversized and unsupported content",()=>{
 for(const bad of [{...model,title:""},{...model,blocks:[]},{...model,blocks:[{type:"html",text:"<script>"}]},{...model,blocks:[{type:"paragraph",text:"x".repeat(12001)}]},{...model,blocks:Array.from({length:301},()=>({type:"bullet",text:"x"}))}])
   assert.equal(validateExportDocument(bad).ok,false);
});
test("rejects unsafe citation URLs",()=>{
 for(const url of ["javascript:alert(1)","http://example.org","file:///etc/passwd","https://user:pass@example.org","invalid"])
   assert.equal(validateExportDocument({...model,references:[{label:"Bad",url}]}).ok,false);
});
