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
// Never silently abbreviate customer-facing contract descriptions.
// Descriptions have room for two lines per 40pt row. Fail closed if both
// available lines cannot accommodate the complete supplied text.
export function wrapQuotationDescription(font,value,maxWidth,size=8){
 const words=value.split(" ");
 const lines=[];
 let current="";
 for(const word of words){
  const proposed=current?current+" "+word:word;
  if(sizeString(font,proposed,maxWidth,size)){current=proposed;continue}
  if(current){lines.push(current);current=""}
  if(sizeString(font,word,maxWidth,size)){current=word;continue}
  // Break very long unspaced words only at exact glyph boundaries.
  let part="";
  for(const character of word){
   if(part&&!sizeString(font,part+character,maxWidth,size)){
    lines.push(part);part="";
   }
   if(!sizeString(font,character,maxWidth,size))
    throw Error("quotation_draft_field_overflow");
   part+=character;
  }
  current=part;
 }
 if(current)lines.push(current);
 if(lines.length>2||lines.length===0)throw Error("quotation_draft_field_overflow");
 return lines;
}
export async function drawLovelyQuotationDraft({pdf,pdfLib,draft}={}){
 if(!pdf?.getPages||!pdf?.embedFont||!pdfLib?.StandardFonts?.Helvetica)
  fail("quotation_draft_pdf_unconfigured");
 // The final owner-approved HTML customization carries fields and full terms\n // that the legacy 8-row PDF background cannot reproduce. Never silently\n // flatten or drop those legally relevant edits.\n if(draft?.customPage!==undefined)\n  fail("lovely_html_document_requires_html_renderer");\n const checked=validateQuotationDraft(draft);
 // The legacy SHA-pinned template has only eight reviewed table rows.
 // Draft storage may accept twelve, but PDF rendering must fail closed.
 if(checked.items.length>8)fail("invalid_quotation_item_count");
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
 text("Customer name: "+checked.customerName,42,223,325,10,bold);
 text("Customer number: "+checked.customerContact,42,240,325,8);
 // 8 fixed-height rows, never expand outside the reviewed template's table.
 checked.items.forEach((item,i)=>{
  const top=337+i*40;
  const lines=wrapQuotationDescription(font,item.description,226,8);
  lines.forEach((line,index)=>text(line,42,top+index*10,226,8));
  text(String(item.quantity),292,top,48,9);
  text(moneyBwp(item.unitPriceCents),376,top,101,9);
  text(moneyBwp(item.lineTotalCents),502,top,89,9);
 });
 text(moneyBwp(checked.subtotalCents),506,655,85,8);
 text("-"+moneyBwp(checked.discountCents),506,682,85,8);
 text(moneyBwp(checked.grandTotalCents),503,711,83,9,bold,white);
 if(checked.paymentMethod)text(checked.paymentMethod,140,701,230,8);
 // Banking fields intentionally NOT drawn over static placeholder lines;
 // use a separately reviewed fully dynamic form before printing accounts.
 return checked;
}
