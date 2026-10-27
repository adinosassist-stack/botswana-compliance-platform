import assert from "node:assert/strict";
import {test} from "node:test";
import {hasExpectedAiExportSignature} from "../server/ai-export-artifact-signature.js";
import {createAiExportService} from "../server/ai-document-export-service.js";
const actor={authenticated:true,workspaceMember:true,tenantId:"t1",actorId:"u1"};
const request={conversationId:"c1",messageId:"m1",format:"pdf",documentType:"report"};
const message={authorized:true,actorRole:"assistant",contentHash:"a".repeat(64),document:{title:"Report",blocks:[{type:"paragraph",text:"P 1200"}],references:[]}};
const pdf=Buffer.from("%PDF-test");
const zip=Buffer.from([0x50,0x4b,0x03,0x04,0x14,0,0,0]);
const job={id:"j1",tenantId:"t1",actorId:"u1",format:"pdf",status:"completed",objectKey:"ai-exports/t1/j1",expiresAt:9000,title:"Report"};
function make({rendered=pdf,stored=pdf,format="pdf"}={}){
 let completed=0;
 const store={
  create:async()=>({...job,format}),
  get:async()=>({...job,format}),
  complete:async()=>{completed++},
  readPrivate:async()=>stored
 };
 const service=createAiExportService({enabled:true,store,clock:()=>1000,loadMessage:async()=>message,render:async()=>rendered});
 return {service,completed:()=>completed};
}
test("format admission requires signed PDF or ZIP container and bounded size",()=>{
 assert.equal(hasExpectedAiExportSignature(pdf,"pdf"),true);
 assert.equal(hasExpectedAiExportSignature(zip,"docx"),true);
 assert.equal(hasExpectedAiExportSignature(zip,"pptx"),true);
 for(const pair of [[Buffer.from("not-a-pdf"),"pdf"],[Buffer.from("malicious"),"docx"],[pdf,"docx"],[zip,"pdf"],[pdf,"exe"],[Buffer.alloc(0),"pdf"],[Buffer.alloc(20*1024*1024+1),"pdf"]]){
  assert.equal(hasExpectedAiExportSignature(...pair),false);
 }
});
test("rendered mismatched file is rejected before completed metadata",async()=>{
 const s=make({rendered:Buffer.from("malicious text, not PDF")});
 const result=await s.service.create(request,actor);
 assert.equal(result.ok,false);
 assert.equal(result.reason,"render_failed");
 assert.equal(s.completed(),0);
});
test("private download blocks corrupt, mislabeled and unsupported formats",async()=>{
 for(const [stored,format] of [[Buffer.from("wrong-data"),"pdf"],[pdf,"docx"],[zip,"pdf"]]){
  const s=make({stored,format});
  const result=await s.service.download("j1",actor);
  assert.equal(result.ok,false);
  assert.equal(result.reason,"not_ready");
 }
});
test("legitimate signatures preserve authorized create and download contracts",async()=>{
 const s=make();
 assert.equal((await s.service.create(request,actor)).ok,true);
 assert.equal(s.completed(),1);
 const download=await s.service.download("j1",actor);
 assert.equal(download.ok,true);
 assert.equal(download.bytes.toString(),"%PDF-test");
});
