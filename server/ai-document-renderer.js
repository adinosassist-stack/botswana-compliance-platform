/** Generate editable office files and text PDFs in a trusted Node worker.
 * Dependencies are dynamically imported so the public runtime is unaffected.
 * This module does not authorize requests, store files or expose downloads.
 */
import {validateExportDocument} from "./ai-document-export-model.js";
export async function renderAiDocument(model, format) {
 const checked=validateExportDocument(model);
 if(!checked.ok)throw new Error(checked.reason);
 const doc=checked.value;
 if(format==="docx"){
   const {Document,Paragraph,TextRun,Packer,HeadingLevel}=await import("docx");
   const children=[new Paragraph({text:doc.title,heading:HeadingLevel.TITLE})];
   for(const block of doc.blocks){
     children.push(new Paragraph({
       children:[new TextRun(block.text)],
       ...(block.type==="heading"?{heading:HeadingLevel.HEADING_2}:{}),
       ...(block.type==="bullet"?{bullet:{level:0}}:{})
     }));
   }
   if(doc.references.length){
     children.push(new Paragraph({text:"References",heading:HeadingLevel.HEADING_2}));
     for(const ref of doc.references)children.push(new Paragraph({text:ref.label+" — "+ref.url}));
   }
   return Buffer.from(await Packer.toBuffer(new Document({sections:[{children}]})));
 }
 if(format==="pptx"){
   const {default:PptxGenJS}=await import("pptxgenjs");
   const pptx=new PptxGenJS();pptx.layout="LAYOUT_WIDE";
   pptx.author="Thebe Desk";
   const items=[{type:"heading",text:doc.title},...doc.blocks,
     ...doc.references.map(r=>({type:"bullet",text:r.label+" — "+r.url}))];
   // One content item per slide prevents unbounded overflow of generated text.
   if(items.length>40)throw new Error("too_many_slides");
   for(const item of items){
     const slide=pptx.addSlide();
     slide.addText(item.text,{x:0.8,y:0.7,w:11.7,h:5.8,
       fontSize:item.type==="heading"?28:18,breakLine:false,
       valign:"top",margin:0.1,fit:"shrink"});
   }
   return Buffer.from(await pptx.write({outputType:"nodebuffer"}));
 }
 if(format==="pdf"){
   const {PDFDocument,StandardFonts}=await import("pdf-lib");
   const pdf=await PDFDocument.create();
   const font=await pdf.embedFont(StandardFonts.Helvetica);
   const lines=[doc.title,...doc.blocks.map(x=>x.text),
     ...doc.references.map(r=>r.label+" - "+r.url)];
   let page=pdf.addPage([595.28,841.89]),y=790;
   for(const text of lines){
     // Standard Helvetica cannot encode all Unicode; reject rather than corrupt.
     if(/[^\x20-\x7E]/.test(text))throw new Error("pdf_unicode_font_required");
     const words=text.split(/\s+/);let line="";
     // Split overlong tokens at glyph boundaries instead of losing legal IDs or URLs.
     const fitted=[];
     for(const word of words){
       let segment="";
       for(const glyph of word){
         if(segment && font.widthOfTextAtSize(segment+glyph,11)>490){fitted.push(segment);segment="";}
         if(font.widthOfTextAtSize(glyph,11)>490)throw new Error("pdf_glyph_too_wide");
         segment+=glyph;
       }
       fitted.push(segment);
     }
     for(const word of fitted){
       const candidate=line?line+" "+word:word;
       if(font.widthOfTextAtSize(candidate,11)>490 && line){
         if(y<60){page=pdf.addPage([595.28,841.89]);y=790}
         page.drawText(line,{x:52,y,size:11,font});y-=18;line=word;
       }else line=candidate;
     }
     if(line){if(y<60){page=pdf.addPage([595.28,841.89]);y=790}
       page.drawText(line,{x:52,y,size:11,font});y-=25;}
   }
   return Buffer.from(await pdf.save());
 }
 throw new Error("unsupported_format");
}
