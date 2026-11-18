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
 const result=await shareDocumentPdf({navigatorApi:{},blob:new Blob(["%PDF"],{type:"application/pdf"}),filename:"quote.pdf",message:{title:"A",text:"B"}});
 assert.equal(result.shared,false);
});
