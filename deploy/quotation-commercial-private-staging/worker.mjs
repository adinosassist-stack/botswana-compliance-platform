import {WorkerEntrypoint} from 'cloudflare:workers';
import {createQuotationCommercialPrivateStagingHost} from '../../server/quotation-commercial-private-staging-host.mjs';
// A separately approved Access-protected gateway may bind this named service.
// No gateway, public URL, synthetic session or secret is created here.
export class QuotationCommercialPrivateRpc extends WorkerEntrypoint {
 async fetch(request){
  try{return await createQuotationCommercialPrivateStagingHost({env:this.env}).fetch(request)}
  catch{return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}})}
 }
}
export default {fetch(){return new Response('Not Found',{status:404})}};
