import {assertPopScanQualification,preparePopScanRequest,applyPopScanResult} from './payment-pop-scan-verification.js';
import {readPopJson} from './payment-pop-http-body.js';

// Synchronous signed scanner protocol v1. No retry or unsigned clean fallback.
export async function scanStoredPop(env,scope,{request=fetch}={}){
 assertPopScanQualification(env);
 if(env.POP_SCAN_TRANSPORT_STAGING_ENABLED!=='true')throw Error('pop_scan_transport_disabled');
 let url;try{url=new URL(env.POP_SCAN_API_URL)}catch{throw Error('pop_scan_transport_config')}
 // Deployment policy must additionally verify provider ownership, DNS and egress.
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.port||
    !/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/i.test(url.hostname)||
    /\.(local|localhost|internal|invalid|test)$/i.test(url.hostname))throw Error('pop_scan_transport_config');
 const prepared=await preparePopScanRequest(env,scope);
 const form=new FormData();form.append('metadata',prepared.metadata);form.append('signature',prepared.signature);
 form.append('file',new Blob([prepared.bytes],{type:'application/octet-stream'}),'quarantined-receipt');
 let response;
 try{response=await request(url.href,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),body:form,headers:{accept:'application/json'}})}
 catch{throw Error('pop_scanner_unavailable')}
 if(!response.ok)throw Error('pop_scanner_unavailable');
 let result;try{result=await readPopJson(response,20000)}catch{throw Error('pop_scanner_invalid_response')}
 if(Object.keys(result).sort().join(',')!=='body,signature'||typeof result.body!=='string'||typeof result.signature!=='string')throw Error('pop_scanner_invalid_response');
 return applyPopScanResult(env,result);
}
