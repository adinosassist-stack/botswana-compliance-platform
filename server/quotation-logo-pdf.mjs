/**
 * Strict company logo placement for a verified two-page quotation PDF template.
 * Does not issue quotes, authorize persistence or replace the original logo.
 * Only accepts an approved LOGO-FREE background for the current tenant.
 * Both template pages are branded; terms page uses a bounded, smaller logo.
 */
import {getCompanyQuotationLogo} from "./quotation-logo-service.mjs";
import {quotationLogoPageRect,inspectLogoSignature} from "../public/js/quotation-logo-layout.mjs";

const deny=code=>{throw new Error(code)};
const bytes=v=>v instanceof Uint8Array?v:null;
export function quotationLogoPdfPlacement({layout,aspectRatio,pageWidth,pageHeight}={}) {
 const p=quotationLogoPageRect(layout,pageWidth,pageHeight,aspectRatio);
 if(![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0||
    p.x<0||p.y<0||p.x+p.width>pageWidth+0.001||p.y+p.height>pageHeight+0.001)
    deny("invalid_logo_pdf_placement");
 // PDF-Lib has a bottom-left origin, while preview/layout has a top-left origin.
 return Object.freeze({x:p.x,y:pageHeight-p.y-p.height,width:p.width,height:p.height});
}
/**
 * Dependencies are all injected. Require authorization, company-scoped private asset
 * store and template service, not just a client-supplied PDF or arbitrary URL.
 *
 * getApprovedLogoFreeTemplate({companyId}) returns:
 * {id, logoFree:true, bytes:Uint8Array, pageCount:2}
 * The background must not already contain a company logo. Do not use the uploaded
 * legacy PDF directly, because it has a baked-in original logo.
 */
export async function renderCompanyQuotationLogoPdf({
 actor,companyId,authorization,store,templates,pdfLib
}={}) {
 if(typeof companyId!=="string"||!companyId||
    typeof templates?.getApprovedLogoFreeTemplate!=="function"||
    typeof pdfLib?.PDFDocument?.load!=="function")deny("quotation_logo_pdf_not_configured");
 const state=await getCompanyQuotationLogo({actor,companyId,authorization,store});
 if(!state)deny("company_logo_not_configured");
 const template=await templates.getApprovedLogoFreeTemplate({companyId});
 if(template?.logoFree!==true||template?.pageCount!==2||!bytes(template.bytes)||
    !template.id||typeof template.id!=="string")deny("unapproved_logo_pdf_template");
 const asset=await store.readPrivateAsset({companyId,logoAssetId:state.settings.logoAssetId});
 if(!asset||!bytes(asset.bytes))deny("company_logo_not_found");
 if(asset.mimeType!=="image/png"&&asset.mimeType!=="image/jpeg")
    deny("logo_pdf_requires_png_or_jpeg");
 inspectLogoSignature(asset.bytes,asset.mimeType);
 if(!Number.isFinite(asset.aspectRatio)||asset.aspectRatio<=0||
    Math.abs(asset.aspectRatio-state.aspectRatio)>0.0001)deny("company_logo_dimension_mismatch");
 const pdf=await pdfLib.PDFDocument.load(template.bytes);
 const pages=pdf.getPages();
 if(pages.length!==2)deny("invalid_quotation_pdf_page_count");
 const page=pages[0];const termsPage=pages[1];
 const {width,height}=page.getSize();
 const termsSize=termsPage.getSize();
 if(width<100||height<100||termsSize.width<100||termsSize.height<100)
  deny("invalid_quotation_pdf_geometry");
 const rect=quotationLogoPdfPlacement({
  layout:state.settings.layout,aspectRatio:asset.aspectRatio,pageWidth:width,pageHeight:height
 });
 // The approved terms template must reserve a logo zone at the top left,
 // separated from the terms heading. Never draw over source document text.
 const termsLayout={xPercent:4,yPercent:2,widthPercent:Math.min(24,
  30*termsSize.height*asset.aspectRatio/termsSize.width)};
 const termsRect=quotationLogoPdfPlacement({
  layout:termsLayout,aspectRatio:asset.aspectRatio,
  pageWidth:termsSize.width,pageHeight:termsSize.height
 });
 // Fixed reserved zone for the two-page Lovely reference: up to 30% width.
 // Template approval must verify the area is blank before this code runs.
 if(termsRect.x+termsRect.width>termsSize.width*0.30+0.001)
  deny("terms_logo_overlaps_heading_zone");
 const image=asset.mimeType==="image/png"?
  await pdf.embedPng(asset.bytes):await pdf.embedJpg(asset.bytes);
 page.drawImage(image,rect);
 termsPage.drawImage(image,termsRect);
 return Object.freeze({bytes:new Uint8Array(await pdf.save()),templateId:template.id,
  logoAssetId:state.settings.logoAssetId,placement:rect,termsPlacement:termsRect});
}
