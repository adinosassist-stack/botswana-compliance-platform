import {createQuotationCommercialStagingGateway} from '../../server/quotation-commercial-staging-gateway.mjs';
let gateway;
export default {async fetch(request,env){
 try{gateway??=createQuotationCommercialStagingGateway({env});return await gateway.fetch(request)}
 catch{return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}})}
}};
