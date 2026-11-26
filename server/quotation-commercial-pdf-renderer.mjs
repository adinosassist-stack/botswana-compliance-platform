/** Private renderer implementation for the separately approved service binding.
 * No public listener, deployment config, database or network access. Host supplies
 * an isolated browser and PDF engine; only its private service entry may call it.
 */
import {renderLovelyFinalQuotationPrintHtml} from './quotation-final-html-print.mjs';
export function createQuotationCommercialPdfRenderer({browser,pdfLib}={}){
 if(typeof browser?.newPage!=='function'||typeof pdfLib?.PDFDocument?.load!=='function')throw Error('quotation_pdf_engine_required');
 return {async fetch(request){
  if(new URL(request.url).pathname!=='/pdf'||request.method!=='POST')return new Response('Not found',{status:404});
  let page;
  try{
   // Caller sends an immutable issued snapshot read from the tenant-scoped DB.
   // Bound body size even when the private adapter is called incorrectly.
   const reader=request.body?.getReader();if(!reader)throw Error('body_required');const chunks=[];let n=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>32768)throw Error('too_large');chunks.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
   const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
   const draft=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!/^(QT|INV)-\d+$/.test(draft.quoteNumber))throw Error('issued_number_required');
   const {html}=renderLovelyFinalQuotationPrintHtml(draft,{watermark:'',customerReady:true});
   page=await browser.newPage({viewport:{width:1100,height:900}});
   // The renderer has no reason to access any network resource.
   await page.route('**/*',route=>route.abort());
   await page.setContent(html,{waitUntil:'load'});await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
   const valid=await page.evaluate(()=>{
    const pages=[...document.querySelectorAll('article.page')];
    return pages.length===2&&pages.every(parent=>{const rect=parent.getBoundingClientRect();return parent.scrollHeight<=parent.clientHeight+2&&[...parent.querySelectorAll('*')].every(child=>{const b=child.getBoundingClientRect();return b.top>=rect.top-1&&b.bottom<=rect.bottom+1&&b.left>=rect.left-1&&b.right<=rect.right+1&&child.scrollHeight<=child.clientHeight+2&&child.scrollWidth<=child.clientWidth+2})});
   });
   if(!valid)throw Error('print_overflow');
   const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});const parsed=await pdfLib.PDFDocument.load(pdf);
   if(pdf.length>20*1024*1024||parsed.getPageCount()!==2||parsed.getPages().some(p=>Math.abs(p.getWidth()-595.28)>1.1||Math.abs(p.getHeight()-841.89)>1.1))throw Error('invalid_pdf_geometry');
   return new Response(pdf,{headers:{'content-type':'application/pdf','x-quotation-page-count':'2','cache-control':'no-store'}});
  }catch{return Response.json({error:'quotation_pdf_render_failed'},{status:503})}finally{await page?.close()}
 }};
}
