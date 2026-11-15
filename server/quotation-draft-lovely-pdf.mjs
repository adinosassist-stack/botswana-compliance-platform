/**
 * Draw validated editable quote values onto the checked, logo-free Lovely
 * two-page template. Never mutates terms, stores a quotation, or issues it.
 * Coordinates are for reviewed Lovely page 1 (612.24 x 858.96 pt).
 * The renderer only accepts an operator-provisioned template, not arbitrary
 * customer-uploaded bytes.
 */
import {moneyBwp,validateQuotationDraft} from "./quotation-draft-model.mjs";
const fail=code=>{throw Error(code)};
const xAscii=s=>String(s);
const sizeString=(font,s,max,size)=>font.widthOfTextAtSize(s,size)<=max;
const trimText=(font,s,width,size)=>{
 if(sizeString(font,s,width,size))return s;
 let out=s;
 while(out.length>1&&!sizeString(font,out+"...",width,size))out=out.slice(0,-1);
 return out+"...";
};
export async function drawLovelyQuotationDraft({pdf,pdfLib,draft}={}){
 if(!pdf?.getPages||!pdf?.embedFont||!pdfLib?.StandardFonts?.Helvetica)
  fail("quotation_draft_pdf_unconfigured");
 const checked=validateQuotationDraft(draft);
 const pages=pdf.getPages(),page=pages[0];
 if(pages.length!==2||!page||Math.abs(page.getWidth()-612.24)>.2||
    Math.abs(page.getHeight()-858.96)>.2)
   fail("quotation_draft_template_geometry_mismatch");
 const font=await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
 const bold=await pdf.embedFont(pdfLib.StandardFonts.HelveticaBold);
 const rgb=pdfLib.rgb;
 if(typeof rgb!=="function")fail("quotation_draft_pdf_unconfigured");
 const charcoal=rgb(.17,.17,.17),white=rgb(1,1,1);
 const text=(value,x,top,maxWidth,size=9,fontUsed=font,color=charcoal)=>{
  if(!sizeString(fontUsed,value,maxWidth,size))fail("quotation_draft_field_overflow");
  page.drawText(xAscii(value),{x,y:858.96-top,size,font:fontUsed,color});
 };
 // Remove only static placeholders; original terms, brand bands and line
 // separators remain unchanged. Covered regions have been visually inspected.
 page.drawRectangle({x:447,y:858.96-220,width:142,height:20,color:rgb(.207,.207,.207)});
 page.drawRectangle({x:464,y:858.96-260,width:127,height:26,color:white});
 text("QUOTE NO: "+checked.quoteNumber,453,213,132,8,bold,white);
 text("Date: "+checked.issueDate,471,251,113,8);
 // Customer block is in the otherwise blank upper-left page-one body area.
 text("CUSTOMER",42,204,160,8,bold);
 text(trimText(font,checked.customerName,325,10),42,223,325,10,bold);
 text(trimText(font,checked.customerContact,325,8),42,240,325,8);
 // 8 fixed-height rows, never expand outside the reviewed template's table.
 checked.items.forEach((item,i)=>{
  const top=337+i*40;
  text(trimText(font,item.description,226,8),42,top,226,8);
  text(String(item.quantity),292,top,48,9);
  text(moneyBwp(item.unitPriceCents),376,top,101,9);
  text(moneyBwp(item.lineTotalCents),502,top,89,9);
 });
 text(moneyBwp(checked.subtotalCents),506,655,85,8);
 text("-"+moneyBwp(checked.discountCents),506,682,85,8);
 text(moneyBwp(checked.grandTotalCents),503,711,83,9,bold,white);
 if(checked.paymentMethod)text(trimText(font,checked.paymentMethod,230,8),140,701,230,8);
 // Banking fields intentionally NOT drawn over static placeholder lines;
 // use a separately reviewed fully dynamic form before printing accounts.
 return checked;
}
