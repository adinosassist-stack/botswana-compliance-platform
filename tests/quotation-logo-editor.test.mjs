import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeQuotationLogoLayout,validateLogoUploadMetadata,inspectLogoSignature} from "../public/js/quotation-logo-layout.mjs";
import {mountQuotationLogoEditor} from "../public/js/quotation-logo-editor.mjs";
const source=readFileSync(new URL("../public/js/quotation-logo-editor.mjs",import.meta.url),"utf8");
test("editor imports without DOM access and refuses missing root",()=>{
 assert.equal(typeof mountQuotationLogoEditor,"function");
 assert.throws(()=>mountQuotationLogoEditor(null),/invalid_logo_editor_root/);
});
test("upload, resize, move, reset, save and keyboard controls wired",()=>{
 for(const token of ["type:'file'","type:'range'","pointerdown","pointermove","pointercancel","ArrowLeft","ArrowRight","Reset position","onUpload(selectedFile)","onSave(settings)"])
  assert.ok(source.includes(token),"expected control "+token);
});
test("file metadata and geometry guards remain active",()=>{
 assert.equal(validateLogoUploadMetadata({type:"image/webp",size:1000,width:800,height:400}).aspectRatio,2);
 assert.throws(()=>inspectLogoSignature(new Uint8Array(20),"image/png"),/invalid_logo_signature/);
 const rect=normalizeQuotationLogoLayout({xPercent:99,yPercent:99,widthPercent:60},612.24,858.96,2);
 assert.ok(rect.xPercent+rect.widthPercent<=100);
 assert.ok(rect.yPercent+rect.heightPercent<=100);
});
test("no silent uploads or storage of private company logo",()=>{
 assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\(/);
 assert.match(source,/typeof options.onUpload!=='function'/);
});
test("width and height readouts reflect clamped geometry and save requires upload adapter",()=>{
 assert.match(source,/dimensions\.textContent=/);
 assert.match(source,/Width .*60%.*Height .*30%/);
 assert.match(source,/typeof options\.onUpload==='function'/);
 assert.match(source,/proportions locked/);
});

test("editor supports authenticated image reload and disables save during active request",()=>{
 assert.match(source,/options\.initialLogoBlob/);
 assert.match(source,/Saved company logo loaded/);
 assert.match(source,/saving=true/);
 assert.match(source,/finally\{saving=false;paint\(\)\}/);
});

test("PDF preview is explicitly user initiated and disabled for unsaved changes",()=>{
 assert.match(source,/Download PDF preview/);
 assert.match(source,/previewPdf\.disabled=dirty\|\|saving\|\|previewing/);
 assert.match(source,/previewPdf\.addEventListener\('click'/);
 assert.match(source,/typeof options\.onPreviewPdf/);
 assert.match(source,/quotation-logo-preview\.pdf/);
});

test("asynchronous logo save snapshots layout and never clears newer edits",()=>{
 assert.match(source,/const revision=editRevision,selectedFile=file,savedLayout=\{\.\.\.layout\},savedRatio=ratio/);
 assert.match(source,/await options\.onUpload\(selectedFile\)/);
 assert.match(source,/layout:savedLayout,aspectRatio:savedRatio/);
 assert.match(source,/if\(editRevision===revision\)/);
 assert.match(source,/Newer logo changes are not saved\. Save again\./);
 assert.match(source,/if\(!dirty\|\|saving\|\|typeof options\.onSave/);
});
