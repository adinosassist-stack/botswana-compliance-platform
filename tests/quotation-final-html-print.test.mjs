import test from "node:test";
import assert from "node:assert/strict";
import {quotationCustomSample} from "../public/js/quotation-customizable-page-model.mjs";
import {renderLovelyFinalQuotationPrintHtml} from "../server/quotation-final-html-print.mjs";
const make=()=>{
 const q=quotationCustomSample();
 q.termsText="Section 1. Synthetic preview terms only.\nSection 2. No customer issue.";
 return q;
};
test("final HTML print produces two pages and preserves all nine default items",()=>{
 const q=make(),out=renderLovelyFinalQuotationPrintHtml(q);
 assert.equal(out.pageCount,2);
 assert.equal(out.previewOnly,true);
 assert.equal((out.html.match(/<article class="page"/g)||[]).length,2);
 assert.equal((out.html.match(/<tr><td>/g)||[]).length,9);
 assert.ok(out.html.includes("Concrete</td>"));
 assert.ok(out.html.includes("Grout 2kg</td>"));
 assert.ok(out.html.includes("Sample customer"));
 assert.ok(out.html.includes("+267 71 000 000"));
 assert.ok(out.html.includes("lovelystones26@gmail.com"));
 assert.ok(out.html.includes("Section 2. No customer issue."));
 assert.ok(out.html.includes("@page{size:A4"));
});
test("totals are derived from validated integer pula cents, never operator sums",()=>{
 const q=make();
 q.items[0].unitPrice="14000.25";
 q.items[1].unitPrice="100.50";q.discount="50.25";
 const v=renderLovelyFinalQuotationPrintHtml(q);
 assert.equal(v.subtotalCents,1420125);
 assert.equal(v.totalCents,1415100);
 assert.ok(v.html.includes("P14,151.00"));
});
test("escapes all editable labels, descriptions and full terms",()=>{
 const q=make();q.customerName="<img src=x onerror=alert(1)>";
 q.items[0].description="<script>alert(1)</script>";
 q.copy.note="<svg onload=alert(1)>";q.termsText="<script>alert(1)</script>\n& conditions";
 const {html}=renderLovelyFinalQuotationPrintHtml(q);
 assert.ok(!html.includes("<script>"));
 assert.ok(!html.includes("<img src="));
 assert.ok(!html.includes("<svg onload="));
 assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
 assert.ok(html.includes("&amp; conditions"));
});
test("never prints a quotation without validated existing terms",()=>{
 const q=make();q.termsText="";
 assert.throws(()=>renderLovelyFinalQuotationPrintHtml(q),/lovely_html_terms_not_qualified/);
});
test("supports twelve items without falling back to eight-row PDF",()=>{
 const q=make();while(q.items.length<12)
 q.items.push({description:"Synthetic item "+q.items.length,quantity:"1",unitPrice:"0.00"});
 const v=renderLovelyFinalQuotationPrintHtml(q);
 assert.equal((v.html.match(/<tr><td>/g)||[]).length,12);
});
test("denies malformed draft and does not accept unbounded HTML",()=>{
 const q=make();q.items[0].unitPrice="not money";
 assert.throws(()=>renderLovelyFinalQuotationPrintHtml(q),/invalid_quotation_money/);
 assert.throws(()=>renderLovelyFinalQuotationPrintHtml(make(),{watermark:""}),/watermark_required/);
});
