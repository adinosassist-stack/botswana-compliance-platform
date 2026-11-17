/**
 * Owner-selected FINAL Lovely quotation document identity (17 Nov 2026).
 * This is the *editable HTML preview*, not the obsolete two-page PDF
 * candidate B. No customer data, bank account values, logo pixels or
 * template HTML are bundled in this identity contract.
 *
 * Checksums attest source bytes only. A checksum is not a legal or
 * independent release approval and it does not enable any runtime.
 */
export const LOVELY_FINAL_HTML_REFERENCE=Object.freeze({
 format:"thebe-lovely-quote-template-v1",
 sourceName:"Thebe_Desk_Lovely_Quotation_Customer_Details_Editable.html",
 sourceSha256:"c57be4e21c126dc318c0caafc17c04cdee50099e130db2f1796f2d93cc982449",
 demoPrintName:"Lovely_Quotation_With_Customer_Fields_Two_Page_Print.pdf",
 demoPrintSha256:"92c22a93bc3eb3c641e1ebbb06ac4b8c7f2733b68ff5af3f26fd401d460aa105",
 expectedDefaultItems:9,
 maxEditableItems:12,
 customerFields:Object.freeze(["customerName","customerPhone"]),
 separateMaterials:Object.freeze(["Concrete","Grout 2kg"])
});
export const OBSOLETE_LOVELY_PDF_CANDIDATE_B_SHA256=
 "8cdb4bf76230d04b8617f01d9c868ca00c518a2f75e10ed15e8ee1bbf332b87e";

/** Fail closed until a separately reviewed HTML-aligned PDF renderer is built. */
export function assertLovelyFinalHtmlPdfRenderer({rendererId,sourceSha256}={}){
 if(rendererId!=="lovely-final-html-v1"||
    sourceSha256!==LOVELY_FINAL_HTML_REFERENCE.sourceSha256)
  throw Error("lovely_final_html_renderer_not_qualified");
 // Exact source identity alone cannot qualify a renderer. This function
 // intentionally does not return an activation or deployment permit.
 throw Error("lovely_final_html_pdf_runtime_not_qualified");
}
