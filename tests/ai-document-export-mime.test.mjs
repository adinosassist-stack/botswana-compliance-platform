import assert from "node:assert/strict";
import {test} from "node:test";
import {exportDownloadHeaders} from "../server/ai-document-export-mime.js";
test("generated export response uses real Office and PDF MIME types",()=>{
 assert.equal(exportDownloadHeaders("pdf")["Content-Type"],"application/pdf");
 assert.match(exportDownloadHeaders("docx")["Content-Type"],/wordprocessingml/);
 assert.match(exportDownloadHeaders("pptx")["Content-Type"],/presentationml/);
});
test("download filenames cannot inject headers or paths",()=>{
 const headers=exportDownloadHeaders("pdf",'../../bad\\r\\nSet-Cookie:evil');
 assert.equal(headers["Content-Disposition"].includes("\\r"),false);
 assert.equal(headers["Content-Disposition"].includes("/"),false);
 assert.equal(headers["Cache-Control"],"private, no-store");
 assert.equal(exportDownloadHeaders("exe"),null);
});
