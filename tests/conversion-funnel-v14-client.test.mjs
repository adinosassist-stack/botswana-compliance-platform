import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(new URL('../public/js/conversion-funnel-v14.js',import.meta.url),'utf8');
function fixture({loading=false,missing=false,reject=false}={}){
  const listeners=new Map(),requests=[],configurations=[],storage=new Map();
  const document={readyState:loading?'loading':'complete',cookie:'',getElementById:()=>null,
    addEventListener(name,handler){listeners.set(name,handler)}};
  const window={BW:missing?undefined:{api:{createClient(options){
    configurations.push(options);
    return {request(url,options){requests.push({url,options});return reject?Promise.reject(new Error('offline')):Promise.resolve({ok:true})}};
  }}}};
  const context={window,document,location:{pathname:'/',search:'?email=private@example.invalid&company=Private&token=secret',href:'https://thebedesk.com/?email=private@example.invalid&company=Private&token=secret'},
    URL,URLSearchParams,crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},setTimeout,
    fetch(){assert.fail('conversion events must use the central API client')}};
  vm.runInNewContext(source,context);
  return {listeners,requests,configurations,document};
}

test('market event waits for deferred API initialization and uses one best-effort central request',()=>{
  const f=fixture({loading:true});
  assert.equal(f.requests.length,0);
  f.listeners.get('DOMContentLoaded')();
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].url,'/api/marketing/conversion-event');
  assert.equal(f.requests[0].options.method,'POST');
  assert.equal(f.requests[0].options.keepalive,true);
  assert.equal(f.configurations[0].retries,0);
  assert.equal(f.configurations[0].timeoutMs,5000);
  const body=JSON.parse(f.requests[0].options.body);
  assert.deepEqual(body,{conversionId:'12345678-1234-1234-1234-123456789abc',stage:'market_view',source:'market',plan:'',path:'/'});
});

test('missing API client does not break page initialization',()=>{
  const f=fixture({missing:true});
  assert.equal(f.requests.length,0);
  assert.equal(typeof f.listeners.get('click'),'function');
});

test('transport rejection is absorbed without blocking the CTA',async()=>{
  const f=fixture({reject:true});
  const anchor={dataset:{ctaSource:'hero',plan:'business'},closest:()=>null};
  f.listeners.get('click')({target:{closest:()=>anchor}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.requests.length,2);
  assert.equal(f.configurations.length,1);
  const body=JSON.parse(f.requests[1].options.body);
  assert.equal(body.stage,'cta_click');
  assert.equal(body.source,'hero');
  assert.equal(body.plan,'business');
  assert.match(f.document.cookie,/Max-Age=1800; SameSite=Lax; Secure/);
});
