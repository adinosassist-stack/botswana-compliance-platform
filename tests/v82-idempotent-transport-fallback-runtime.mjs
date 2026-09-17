import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/js/api-client.js','utf8');
const calls=[];
let rootAbortCount=0;
let requestCounter=0;

function jsonResponse(data,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    headers:new Headers({'content-type':'application/json'}),
    async json(){return data},
    async text(){return JSON.stringify(data)}
  };
}

async function mockedFetch(raw,{signal}={}){
  const url=new URL(String(raw));
  calls.push(url.href);
  if(url.searchParams.get('__thebe_api_path')==='/api/state'){
    return new Promise(()=>{
      const observeAbort=()=>{rootAbortCount+=1};
      if(signal?.aborted){observeAbort();return}
      signal?.addEventListener('abort',observeAbort,{once:true});
      // Deliberately ignore the AbortSignal and never resolve/reject. Real browsers,
      // intermediaries, or platform fetch implementations can leave a request in
      // this state after abort; fallback must not depend on fetch settling.
    });
  }
  if(url.pathname==='/__thebe_api/state'){
    requestCounter+=1;
    return jsonResponse({version:requestCounter,state:{ok:true}});
  }
  throw new Error(`unexpected transport ${url.href}`);
}

const appended=[];
const document={
  querySelector(selector){
    if(selector==='meta[name="bw-runtime-mode"]')return {content:'production'};
    return null;
  },
  createElement(){return {dataset:{},src:'',defer:false}},
  head:{append(node){appended.push(node)}},
  documentElement:{append(node){appended.push(node)}}
};
const window={
  document,
  location:{href:'https://thebedesk.com/',origin:'https://thebedesk.com',replace(){throw new Error('unexpected canonical redirect')}},
  crypto:{randomUUID(){return `test-${requestCounter}-${calls.length}`}}
};
const context={window,URL,Headers,AbortController,FormData,setTimeout,clearTimeout,console,fetch:mockedFetch,Error,Date,Math,Object,String,Number,JSON,Promise};
vm.runInNewContext(source,context,{filename:'public/js/api-client.js'});

assert.ok(window.BW?.api?.createClient,'production API client did not initialize');
const client=window.BW.api.createClient({timeoutMs:240,retries:0});
const started=Date.now();
const first=await client.request('/api/state');
const elapsed=Date.now()-started;

assert.equal(first.version,1,'shadow fallback did not return the state response');
assert.equal(rootAbortCount,1,'hung root transport was not locally aborted exactly once');
assert.ok(calls[0].includes('__thebe_api_path=%2Fapi%2Fstate'),'root tunnel was not attempted first');
assert.equal(new URL(calls[1]).pathname,'/__thebe_api/state','shadow fallback was not attempted after the abort-insensitive hung root transport');
assert.ok(elapsed<220,`fallback consumed the full request deadline (${elapsed}ms)`);

const beforeSecond=calls.length;
const second=await client.request('/api/state');
assert.equal(second.version,2,'second state read did not succeed');
assert.equal(new URL(calls[beforeSecond]).pathname,'/__thebe_api/state','successful shadow transport was not promoted to preferred transport');
assert.equal(rootAbortCount,1,'preferred shadow transport unexpectedly retried the hung root route');
assert.equal(appended.length,1,'owner WhatsApp loader contract changed unexpectedly');

console.log('Idempotent transport fallback runtime (abort-insensitive fetch): PASS');