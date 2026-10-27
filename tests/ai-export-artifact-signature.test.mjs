import assert from "node:assert/strict";
import {test} from "node:test";
import {hasExpectedAiExportSignature} from "../server/ai-export-artifact-signature.js";
import {createAiExportService} from "../server/ai-document-export-service.js";
const actor={authenticated:true,workspaceMember:true,tenantId:"t1",actorId:"u1"};
const request={conversationId:"c1",messageId:"m1",format:"pdf",documentType:"report"};
const message={authorized:true,actorRole:"assistant",contentHash:"a".repeat(64),document:{title:"Report",blocks:[{type:"paragraph",text:"P 1200"}],references:[]}};
const pdf=Buffer.from("%PDF-test");
// Build minimal spec-compliant STORED ZIPs without external package dependencies.
function makeZip(paths){
 const localParts=[],centralParts=[];let localOffset=0;
 for(const path of paths){
  const name=Buffer.from(path),data=Buffer.from("<xml/>");
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);
  local.writeUInt16LE(name.length,26);
  localParts.push(local,name,data);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);
  entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);
  entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);
  entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(localOffset,42);
  centralParts.push(entry,name);
  localOffset+=local.length+name.length+data.length;
 }
 const central=Buffer.concat(centralParts),footer=Buffer.alloc(22);
 footer.writeUInt32LE(0x06054b50,0);footer.writeUInt16LE(paths.length,8);footer.writeUInt16LE(paths.length,10);
 footer.writeUInt32LE(central.length,12);footer.writeUInt32LE(localOffset,16);
 return Buffer.concat([...localParts,central,footer]);
}
const zip=Buffer.from([0x50,0x4b,0x03,0x04,0x14,0,0,0]);
const docx=makeZip(["[Content_Types].xml","_rels/.rels","word/document.xml"]);
const pptx=makeZip(["[Content_Types].xml","_rels/.rels","ppt/presentation.xml"]);
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
 assert.equal(hasExpectedAiExportSignature(docx,"docx"),true);
 assert.equal(hasExpectedAiExportSignature(pptx,"pptx"),true);
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

test("PK prefix without valid OOXML central directory cannot be downloaded",async()=>{
 assert.equal(hasExpectedAiExportSignature(zip,"docx"),false);
 assert.equal(hasExpectedAiExportSignature(zip,"pptx"),false);
 assert.equal(hasExpectedAiExportSignature(docx,"pptx"),false);
 assert.equal(hasExpectedAiExportSignature(pptx,"docx"),false);
 for(const bytes of [docx.subarray(0,docx.length-1),Buffer.concat([docx,Buffer.from("junk")]),
   makeZip(["[Content_Types].xml","_rels/.rels","word/incorrect.xml"]),
   makeZip(["[Content_Types].xml","_rels/.rels","../word/document.xml"]),
   makeZip(["[Content_Types].xml","_rels/.rels","word/document.xml","word/document.xml"]),
   makeZip(["[Content_Types].xml","_rels/.rels","word/document.xml","word/embeddings/evil.bin"])]){
  assert.equal(hasExpectedAiExportSignature(bytes,"docx"),false);
 }
});
test("OOXML create and private download admit matching valid package type",async()=>{
 for(const [format,bytes] of [["docx",docx],["pptx",pptx]]){
  const s=make({format,rendered:bytes,stored:bytes});
  assert.equal((await s.service.create({...request,format},actor)).ok,true);
  assert.equal((await s.service.download("j1",actor)).ok,true);
 }
});
