import test from "node:test";
import assert from "node:assert/strict";
import {buildDocumentShare,shareDocumentPdf,prepareDocumentPdf,sharePreparedDocumentPdf} from "../public/js/essentials-document-share.mjs";

test("quotation share metadata contains BWP and reference",()=>{
 const x=buildDocumentShare({kind:"quotation",reference:"Q-001",customerName:"Example Client",amountBwp:"1500.00"});
 assert.equal(x.title,"Quotation Q-001");
 assert.match(x.text,/BWP 1500\.00/);
});
test("reject invalid amounts and control characters",()=>{
 assert.throws(()=>buildDocumentShare({kind:"invoice",reference:"I-1",customerName:"Client",amountBwp:"-5.00"}),/invalid_amount/);
 assert.throws(()=>buildDocumentShare({kind:"invoice",reference:"I-1\n",customerName:"Client",amountBwp:"5.00"}),/invalid_document/);
});
test("reject non-PDF blobs and invalid filenames",async()=>{
 await assert.rejects(shareDocumentPdf({blob:new Blob(["x"],{type:"text/plain"}),filename:"quote.pdf",message:{title:"A",text:"B"}}),/invalid_pdf/);
 await assert.rejects(shareDocumentPdf({blob:new Blob(["%PDF-1.7\\n"],{type:"application/pdf"}),filename:"../quote.pdf",message:{title:"A",text:"B"}}),/invalid_filename/);
});
test("no native share leaves document unsent",async()=>{
 const result=await shareDocumentPdf({navigatorApi:{},blob:new Blob(["%PDF-1.7\\n"],{type:"application/pdf"}),filename:"quote.pdf",message:{title:"A",text:"B"}});
 assert.equal(result.shared,false);
});

test("rejects forged PDF MIME type, short data and oversize files before invoking native share",async()=>{
 let invoked=0;
 const navigatorApi={canShare:()=>{invoked++;return true},share:async()=>{invoked++}};
 for(const blob of [
  new Blob(["<html>not a pdf</html>"],{type:"application/pdf"}),
  new Blob(["%PDF"],{type:"application/pdf"}),
  new Blob([new Uint8Array(20*1024*1024+1)],{type:"application/pdf"})
 ]){
  await assert.rejects(shareDocumentPdf({navigatorApi,blob,
   filename:"quotation.pdf",message:{title:"Quotation",text:"See attachment"}}),/invalid_pdf/);
 }
 assert.equal(invoked,0);
});
test("valid PDF data without native sharing returns unavailable without sending",async()=>{
 const blob=new Blob(["%PDF-1.7\\n1 0 obj\\n"],{type:"application/pdf"});
 const result=await shareDocumentPdf({navigatorApi:{canShare:()=>false,share:async()=>{throw Error("must_not_send")}},
  blob,filename:"quotation.pdf",message:{title:"Quotation",text:"Review attachment"}});
 assert.deepEqual(result,{shared:false,reason:typeof File==="undefined"?"file_api_unavailable":"native_share_unavailable"});
});


test("prepared PDF invokes native share synchronously from the gesture, file only",async()=>{
 const file=await prepareDocumentPdf({blob:new Blob(["%PDF-1.7\nTEST"],{type:"application/pdf"}),filename:"quote-01.pdf"});
 assert.ok(file);let payload;const result=sharePreparedDocumentPdf({file,message:{title:"Quotation",text:"Review attachment"},navigatorApi:{canShare:p=>p.files[0]===file,share:p=>{payload=p;return Promise.resolve()}}});
 assert.deepEqual(payload,{files:[file]});assert.equal(file.name,"quote-01.pdf");assert.equal(file.type,"application/pdf");assert.equal(await file.text(),"%PDF-1.7\nTEST");assert.deepEqual(await result,{shared:true});
});
test("native cancellation remains a cancellation and unprepared files cannot be sent",async()=>{
 const message={title:"Quotation",text:"Review attachment"};const blob=new Blob(["%PDF-1.7\nTEST"],{type:"application/pdf"});const file=await prepareDocumentPdf({blob,filename:"quote.pdf"});
 const navigatorApi={canShare:()=>true,share:()=>Promise.reject(Object.assign(Error("cancelled"),{name:"AbortError"}))};
 await assert.rejects(sharePreparedDocumentPdf({navigatorApi,file,message}),{name:"AbortError"});
 await assert.rejects(sharePreparedDocumentPdf({navigatorApi,file:new File([blob],"quote.pdf",{type:"application/pdf"}),message}),/unprepared_pdf/);
});

test("accepts saved PDFs with missing or generic picker MIME metadata",async()=>{
 for(const type of ["","application/octet-stream"]){
  const blob=new Blob(["%PDF-1.7\nTEST"],{type});
  const file=await prepareDocumentPdf({blob,filename:"quotation.pdf"});
  if(typeof File==="undefined"){assert.equal(file,null);continue;}
  assert.equal(file.type,"application/pdf");
  assert.equal(await file.text(),await blob.text());
 }
});

test("rejects generic picker files without a PDF header",async()=>{
 const blob=new Blob(["not a PDF"],{type:"application/octet-stream"});
 await assert.rejects(prepareDocumentPdf({blob,filename:"quotation.pdf"}),/invalid_pdf/);
});
