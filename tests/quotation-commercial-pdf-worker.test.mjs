import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('private PDF Worker reaches the real Cloudflare browser acquisition API and stays fail-closed',async()=>{
 const bundle=await build({stdin:{contents:`
  import {QuotationCommercialPdfPrivateRpc} from './deploy/quotation-final-html-private/commercial-worker.mjs';
  import privateHttp from './deploy/quotation-final-html-private/commercial-worker.mjs';
  export default {async fetch(request,env,ctx){
   if(new URL(request.url).pathname==='/default')return privateHttp.fetch(request);
   return new QuotationCommercialPdfPrivateRpc(ctx,{
    APP_ENV:'quotation-private-staging',
    QUOTATION_COMMERCIAL_PDF_STAGE_ENABLED:request.headers.get('x-test-enabled'),
    QUOTATION_BROWSER:env.BROWSER_PROBE
   }).fetch(request);
  }};`,resolveDir:process.cwd(),sourcefile:'pdf-worker-probe.mjs'},bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],conditions:['workerd','worker','browser'],external:['cloudflare:*','node:*'],logLevel:'silent'});
 const calls=[];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,
  compatibilityDate:'2026-09-03',compatibilityFlags:['nodejs_compat'],
  serviceBindings:{BROWSER_PROBE:async request=>{
   calls.push(new URL(request.url).pathname);
   return new Response('Synthetic browser capacity unavailable',{status:503});
  }}
 }));
 try{
  assert.equal((await mf.dispatchFetch('http://local/default')).status,404);
  assert.equal((await mf.dispatchFetch('http://local/pdf',{headers:{'x-test-enabled':'false'}})).status,404);
  assert.deepEqual(calls,[],'disabled and default HTTP paths must not acquire a browser');
  const response=await mf.dispatchFetch('http://local/pdf',{method:'POST',headers:{'x-test-enabled':'true'},body:'{}'});
  assert.equal(response.status,503);
  assert.equal(await response.text(),'PDF unavailable');
  assert.deepEqual(calls,['/v1/acquire'],'use Cloudflare launch(binding), not unsupported chromium.launch()');
 }finally{await mf.dispose()}
});
