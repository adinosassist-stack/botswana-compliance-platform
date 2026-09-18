import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/js/api-client.js','utf8');
const calls=[];
let rootAbortCount=0;
let stateCounter=0;
let fallbackCounter=0;

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
    stateCounter+=1;
    return jsonResponse({version:stateCounter,state:{ok:true}});
  }
  if(url.pathname==='/api/state'){
    throw new Error('workspace state must not bypass the preferred transport');
  }
  if(url.searchParams.get('__thebe_api_path')==='/api/fallback-probe'){
    return new Promise(()=>{
      const observeAbort=()=>{rootAbortCount+=1};
      if(signal?.aborted){observeAbort();return}
      signal?.addEventListener('abort',observeAbort,{once:true});
    });
  }
  if(url.pathname==='/__thebe_api/fallback-probe'){
    fallbackCounter+=1;
    return jsonResponse({version:fallbackCounter,state:{ok:true}});
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
  crypto:{randomUUID(){return `test-${stateCounter}-${fallbackCounter}-${calls.length}`}}
};
const context={window,URL,Headers,AbortController,FormData,setTimeout,clearTimeout,console,fetch:mockedFetch,Error,Date,Math,Object,String,Number,JSON,Promise};
vm.runInNewContext(source,context,{filename:'public/js/api-client.js'});

assert.ok(window.BW?.api?.createClient,'production API client did not initialize');

const stateClient=window.BW.api.createClient({timeoutMs:240,retries:0});
const stateStart=calls.length;
const state=await stateClient.request('/api/state');
assert.equal(state.version,1,'preferred state read did not return the workspace state');
assert.ok(calls[stateStart].includes('__thebe_api_path=%2Fapi%2Fstate'),'cold workspace state must start with the preferred root tunnel');
assert.ok(!calls.slice(stateStart).some(raw=>new URL(raw).pathname==='/api/state'),'cold workspace state unexpectedly bypassed transport fallback with the direct route');

const fallbackClient=window.BW.api.createClient({timeoutMs:240,retries:0});
const fallbackStart=calls.length;
const started=Date.now();
const fallback=await fallbackClient.request('/api/fallback-probe');
const elapsed=Date.now()-started;
assert.equal(fallback.version,1,'shadow fallback did not return the probe response');
assert.equal(rootAbortCount,1,'hung root transport was not locally aborted exactly once');
assert.ok(calls[fallbackStart].includes('__thebe_api_path=%2Fapi%2Ffallback-probe'),'generic idempotent read no longer starts with the preferred root tunnel');
assert.equal(new URL(calls[fallbackStart+1]).pathname,'/__thebe_api/fallback-probe','shadow fallback was not attempted after the hung root transport');
assert.ok(elapsed<220,`fallback consumed the full request deadline (${elapsed}ms)`);

const beforeSecond=calls.length;
const second=await fallbackClient.request('/api/fallback-probe');
assert.equal(second.version,2,'second fallback read did not succeed');
assert.equal(new URL(calls[beforeSecond]).pathname,'/__thebe_api/fallback-probe','successful shadow transport was not promoted to preferred transport');
assert.equal(rootAbortCount,1,'preferred shadow transport unexpectedly retried the hung root route');
assert.equal(appended.length,1,'owner WhatsApp loader contract changed unexpectedly');

console.log('Idempotent transport fallback runtime: preferred workspace state transport + bounded generic fallback PASS');
