import {WorkerEntrypoint} from 'cloudflare:workers';
import {chromium} from '@cloudflare/playwright';
import {PDFDocument} from 'pdf-lib';
import {createQuotationCommercialPdfRenderer} from '../../server/quotation-commercial-pdf-renderer.mjs';
// Only the separately approved application service binding may invoke this class.
export class QuotationCommercialPdfPrivateRpc extends WorkerEntrypoint {
 async fetch(request){
  if(this.env.APP_ENV!=='quotation-private-staging'||this.env.QUOTATION_COMMERCIAL_PDF_STAGE_ENABLED!=='true'||!this.env.QUOTATION_BROWSER)return new Response('Not Found',{status:404});
  let browser;try{
   browser=await chromium.launch(this.env.QUOTATION_BROWSER);
   return await createQuotationCommercialPdfRenderer({browser,pdfLib:{PDFDocument}}).fetch(request);
  }catch{return new Response('PDF unavailable',{status:503})}finally{await browser?.close()}
 }
}
export default {fetch(){return new Response('Not Found',{status:404})}};
