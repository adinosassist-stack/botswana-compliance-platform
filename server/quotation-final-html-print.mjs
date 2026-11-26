/**
 * Private, source-only HTML-to-print document renderer for the final editable
 * Lovely quotation. This returns an HTML string; it DOES NOT return a PDF,
 * expose an HTTP route, store a draft, or issue a customer quotation.
 * Browser PDF creation requires a separately reviewed print host.
 */
import {
  validateQuotationCustomPage, quotationCustomFormatMoney
} from "../public/js/quotation-customizable-page-model.mjs";

const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const tag=(name,text,cls="")=>`<${name}${cls?` class="${cls}"`:""}>${escapeHtml(text)}</${name}>`;
const currency=quotationCustomFormatMoney;
const lines=(values)=>values.filter(([,v])=>v).map(([k,v])=>tag("p",k+": "+v)).join("");
const MAX_TERMS_CHARS=7500;

/** Escape all edited fields. Never accept raw HTML/CSS/JS from an operator. */
export function renderLovelyFinalQuotationPrintHtml(document,{watermark="PRIVATE PREVIEW — NOT FOR CUSTOMER ISSUE",trustedLogo=null,customerReady=false}={}){
 const q=validateQuotationCustomPage(document);
 if(!q.termsText||q.termsText.length>MAX_TERMS_CHARS)
   throw Error("lovely_html_terms_not_qualified");
 if(typeof watermark!=="string"||watermark.length>100||(!watermark.trim()&&!customerReady))
   throw Error("lovely_html_print_watermark_required");
 const c=q.copy;
 // Caller must have decoded and sanitized this PNG via the tenant-scoped
 // private store. No client-controlled URL, SVG, JPEG or arbitrary markup.
 if(trustedLogo!==null&&(
   !trustedLogo||trustedLogo.mimeType!=="image/png"||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(trustedLogo.base64||"")||
   trustedLogo.base64.length>3*1024*1024||
   !Number.isInteger(trustedLogo.widthPercent)||
   trustedLogo.widthPercent<15||trustedLogo.widthPercent>50||
   !Number.isInteger(trustedLogo.xPercent)||
   trustedLogo.xPercent<0||trustedLogo.xPercent>60
 ))throw Error("lovely_html_untrusted_logo");
 const rows=q.items.map(item=>`<tr><td>${escapeHtml(item.description)}</td><td class="n">${item.quantity}</td><td class="n">${escapeHtml(currency(item.unitPriceCents))}</td><td class="n">${escapeHtml(currency(item.totalCents))}</td></tr>`).join("");
 const top=(title)=>`<header class="mast"><div class="brand">${trustedLogo?
 `<img alt="Company logo" src="data:image/png;base64,${trustedLogo.base64}" style="width:${trustedLogo.widthPercent}%;margin-left:${trustedLogo.xPercent}%;max-height:105px;object-fit:contain;object-position:left center">`:
 escapeHtml(c.brandName)}</div><h1>${escapeHtml(title)}</h1></header>`;
 const footer=(withContact)=>`<footer><div>${escapeHtml(c.footerLocations)}</div>${withContact?`<div class="contact">${escapeHtml([c.footerEmail,c.footerPhone].filter(Boolean).join(" | "))}</div>`:""}</footer>`;
 const style=`@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#1b1b1b;font:12px/1.45 Arial,sans-serif}
 .page{width:210mm;height:297mm;padding:13mm 13mm 17mm;display:flex;flex-direction:column;gap:13px;position:relative;break-after:page;overflow:hidden}
 .page:last-child{break-after:auto}.watermark{color:#961218;font-size:10px;letter-spacing:.5px;font-weight:bold}
 .mast{min-height:102px;display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:2px solid #d20c15}
 .brand{font-size:25px;font-weight:bold;max-width:55%;min-width:0;flex:1}.brand img{display:block;max-width:100%;height:auto}.mast h1{margin:0;padding:8px 17px;background:#d10d16;color:#fff;font-size:22px;text-align:right}
 .meta{display:grid;grid-template-columns:1.45fr 1fr;gap:10px}.meta section{background:#f2f3f5;padding:10px 12px;min-width:0}
 h3{color:#c00912;font-size:12px;margin:0 0 5px;text-transform:uppercase}p{margin:3px 0;overflow-wrap:anywhere}
 table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px}th{text-align:left;background:#bd1018;color:white;padding:7px 6px}
 th:nth-child(1){width:47%}th:nth-child(2){width:12%}th:nth-child(3){width:20%}th:nth-child(4){width:21%}
 td{border-bottom:1px solid #d9dde1;padding:6px;overflow-wrap:anywhere}.n{text-align:right}
 .totals{width:45%;margin-left:auto}.totals p{display:flex;justify-content:space-between;gap:10px;padding:6px 7px}
 .grand{background:#bd1018;color:#fff;font-weight:bold}.pay{border-top:1px solid #e0e3e6;padding-top:10px}
 footer{margin-top:auto;border-top:2px solid #d20c15;padding-top:9px;font-size:10px}.contact{font-weight:bold;margin-top:5px}
 .terms{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;font-size:11px;flex:1}.signature{border-top:1px solid #ddd;padding-top:14px}
 @media screen{body{background:#e6e8ed}.page{background:#fff;margin:14px auto;box-shadow:0 3px 15px #17233220}}
 @media print{.page{box-shadow:none;margin:0}body{background:#fff}}`;
 const doc=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Lovely quotation — private preview</title><style>${style}</style></head><body>
 <article class="page" data-page="1">${watermark?tag("div",watermark,"watermark"):""}${top(c.heading)}
 <div class="meta"><section><h3>${escapeHtml(c.customerHeading)}</h3>${lines([[c.customerNameLabel,q.customerName],[c.customerPhoneLabel,q.customerPhone],[c.locationLabel,q.location]])}</section>
 <section><h3>${escapeHtml(c.heading)}</h3>${lines([[c.quoteNumberLabel,q.quoteNumber],[c.dateLabel,q.issueDate]])}</section></div>
 <table><thead><tr>${[c.descriptionLabel,c.quantityLabel,c.unitPriceLabel,c.lineTotalLabel].map(h=>tag("th",h)).join("")}</tr></thead><tbody>${rows}</tbody></table>
 <div class="totals"><p><span>${escapeHtml(c.subtotalLabel)}</span><strong>${escapeHtml(currency(q.subtotalCents))}</strong></p>
 <p><span>${escapeHtml(c.discountLabel)}</span><strong>-${escapeHtml(currency(q.discountCents))}</strong></p>
 <p class="grand"><span>${escapeHtml(c.grandTotalLabel)}</span><strong>${escapeHtml(currency(q.totalCents))}</strong></p></div>
 <section class="pay"><h3>${escapeHtml(c.paymentHeading)}</h3>${lines([[c.paymentMethodLabel,c.paymentMethod],[c.bankLabel,c.bankName],[c.bankBranchLabel,c.bankBranch],[c.bankAccountLabel,c.bankAccount||"—"],["Account holder",c.bankAccountHolder],["Branch code",c.bankBranchCode],["Payment reference",c.bankPaymentReference]])}</section>
 ${tag("p",c.note)}${footer(true)}</article>
 <article class="page" data-page="2">${watermark?tag("div",watermark,"watermark"):""}${top(c.termsHeading)}
 ${tag("div",q.termsText,"terms")}
 ${tag("div",c.signatureLabel+" __________________________","signature")}${footer(false)}</article></body></html>`;
 return Object.freeze({html:doc,pageCount:2,subtotalCents:q.subtotalCents,
  discountCents:q.discountCents,totalCents:q.totalCents,previewOnly:true});
}
