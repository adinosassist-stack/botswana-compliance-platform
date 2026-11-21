import test from "node:test";
import assert from "node:assert/strict";
import {buildDocumentShare,shareDocumentPdf} from "../public/js/essentials-document-share.mjs";

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
 await assert.rejects(shareDocumentPdf({blob:new Blob(["x"],{type:"application/pdf"}),filename:"../quote.pdf",message:{title:"A",text:"B"}}),/invalid_filename/);
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
