import assert from "node:assert/strict";
import {test} from "node:test";
import {validateAiExportRequest} from "../server/ai-document-export-policy.js";
const ctx={tenantId:"tenant1",actorId:"employee1",authenticated:true,workspaceMember:true};
const req={conversationId:"conv1",messageId:"msg1",format:"pdf",documentType:"research"};
test("authorized research export binds tenant and actor to trusted context",()=>{
 const result=validateAiExportRequest(req,ctx);
 assert.equal(result.ok,true);assert.equal(result.value.tenantId,"tenant1");
 assert.equal(result.value.actorId,"employee1");
});
test("unauthorized and nonmember requests fail closed",()=>{
 for(const c of [null,{...ctx,authenticated:false},{...ctx,workspaceMember:false},{...ctx,tenantId:""}])
   assert.equal(validateAiExportRequest(req,c).ok,false);
});
test("rejects spoofed identity, content and download URL",()=>{
 for(const key of ["tenantId","actorId","content","html","downloadUrl"])
   assert.equal(validateAiExportRequest({...req,[key]:"injected"},ctx).ok,false);
});
test("supports true formats with bounded options",()=>{
 for(const format of ["pdf","docx","pptx"])assert.equal(validateAiExportRequest({...req,format},ctx).ok,true);
 for(const format of ["html","exe","PDF",null])assert.equal(validateAiExportRequest({...req,format},ctx).ok,false);
 for(const slideCount of [-1,0,41,1.5,"10"])assert.equal(validateAiExportRequest({...req,format:"pptx",options:{slideCount}},ctx).ok,false);
 assert.equal(validateAiExportRequest({...req,format:"pptx",documentType:"presentation",options:{slideCount:12}},ctx).ok,true);
 assert.equal(validateAiExportRequest({...req,format:"docx",documentType:"presentation"},ctx).ok,false);
});
test("rejects untrusted options and malformed identifiers",()=>{
 for(const options of [{templateUrl:"https://evil.test"},{title:"x".repeat(161)},{pageSize:"A0"},{slideCount:3},[]])
   assert.equal(validateAiExportRequest({...req,options},ctx).ok,false);
 assert.equal(validateAiExportRequest({...req,messageId:"../../etc/passwd"},ctx).ok,false);
});
