import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {bootstrapPopUi,popStagingPage} from '../cloudflare/src/payment-pop-staging-ui.js';
import {createPopHttpStagingEntry} from '../cloudflare/src/payment-pop-http-staging-entry.js';
const ids=['status','session','upload','review','login','logout','password','email','file','order','receipts','reviewOrder'];
class Element{
 constructor(tag='div'){this.tag=tag;this.handlers={};this.children=[];this.hidden=false;this.value='';this.files=[];this.disabled=false;this.textContent=''}
 addEventListener(type,fn){this.handlers[type]=fn}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes}
 fire(type){this.handlers[type]?.({preventDefault(){}})}
}
const settle=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve))};
function harness(fetch){
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const document={getElementById:id=>nodes[id],querySelectorAll:()=>Object.values(nodes).filter(x=>x.tag==='button'),createElement:tag=>new Element(tag)};
 const ctx=vm.createContext({document,fetch,crypto:webcrypto,AbortController,URLSearchParams,setTimeout,clearTimeout,prompt:()=>null,confirm:()=>false});
 vm.runInContext('('+bootstrapPopUi.toString()+')()',ctx);return nodes;
}
test('page has per-response nonce, restrictive CSP, accessible status and explicit staging/payment warning',async()=>{
 const a=popStagingPage(),b=popStagingPage(),html=await a.text(),csp=a.headers.get('content-security-policy');
 const nonce=html.match(/<script nonce="([^"]+)"/)[1];assert.ok(csp.includes("script-src 'nonce-"+nonce+"'"));
 assert.notEqual(csp,b.headers.get('content-security-policy'));assert.match(csp,/connect-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);
 assert.match(html,/synthetic receipts only/);assert.match(html,/never confirms payment/);assert.match(html,/aria-live="polite"/);
 assert.doesNotMatch(html,/localStorage|sessionStorage|innerHTML/);assert.equal(a.headers.get('cache-control'),'private, no-store');
});
test('customer session shows upload but never platform review; files over limit make no upload request',async()=>{
 const calls=[];const nodes=harness(async(path,options)=>{calls.push({path,options});return Response.json({user:{email:'customer@example.invalid',platformBillingAdmin:false},csrfToken:'csrf'})});
 await settle();assert.equal(nodes.upload.hidden,false);assert.equal(nodes.review.hidden,true);
 nodes.file.files=[{size:3670017}];nodes.upload.fire('submit');await settle();
 assert.equal(calls.length,1);assert.match(nodes.status.textContent,/up to 3.5 MiB/);
});
test('login sends same-origin credentials without storing password and preserves server-derived owner capability',async()=>{
 const calls=[];let loggedIn=false;
 const nodes=harness(async(path,options)=>{calls.push({path,options});if(path==='/api/auth/login'){loggedIn=true;return Response.json({csrfToken:'csrf'})}
  if(!loggedIn)return Response.json({error:'unauthenticated'},{status:401});return Response.json({user:{email:'owner@example.invalid',platformBillingAdmin:true},csrfToken:'csrf'});
 });await settle();nodes.email.value='owner@example.invalid';nodes.password.value='test-only-password';nodes.login.fire('submit');await settle();
 const login=calls.find(x=>x.path==='/api/auth/login');assert.equal(login.options.credentials,'same-origin');assert.equal(login.options.redirect,'error');
 assert.equal(nodes.password.value,'');assert.equal(nodes.review.hidden,false);assert.equal(nodes.login.hidden,true);
});
test('failed upload retry preserves idempotency key; success clears file and never reports activation',async()=>{
 const keys=[];let attempts=0;
 const nodes=harness(async(path,options)=>{if(path==='/api/auth/me')return Response.json({user:{email:'customer@example.invalid'},csrfToken:'csrf'});
  keys.push(options.headers['idempotency-key']);attempts++;return attempts===1?Response.json({error:'unavailable'},{status:503}):Response.json({documentId:'receipt-1',subscriptionActivated:false});
 });await settle();nodes.file.files=[{size:9,type:'image/png',name:'receipt.png'}];nodes.file.value='receipt.png';nodes.order.value='order-1';
 nodes.upload.fire('submit');await settle();nodes.upload.fire('submit');await settle();
 assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(nodes.file.value,'');assert.match(nodes.status.textContent,/plan remains unchanged/);
});
test('sign out fences a late upload response and clears receipt metadata',async()=>{
 let finish;
 const nodes=harness(async(path)=>{
  if(path==='/api/auth/me')return Response.json({user:{email:'customer@example.invalid'},csrfToken:'csrf'});
  if(path==='/api/auth/logout')return Response.json({ok:true});
  return new Promise(resolve=>{finish=resolve});
 });await settle();nodes.file.files=[{size:9,type:'image/png',name:'receipt.png'}];nodes.order.value='order';nodes.upload.fire('submit');await settle();
 nodes.receipts.children.push(new Element());nodes.logout.fire('click');await settle();finish(Response.json({documentId:'late-receipt'}));await settle();
 assert.equal(nodes.upload.hidden,true);assert.equal(nodes.receipts.children.length,0);assert.equal(nodes.status.textContent,'Signed out.');
});
test('platform receipt names are literal text; download scope is derived from server metadata',async()=>{
 const row={id:'doc',tenant_id:'tenant',payment_order_id:'order',display_name:'<img src=x onerror=alert(1)>',scan_status:'clean'};
 const nodes=harness(async(path)=>path==='/api/auth/me'?Response.json({user:{email:'owner@example.invalid',platformBillingAdmin:true},csrfToken:'csrf'}):Response.json({items:[row]}));
 await settle();nodes.reviewOrder.value='order';nodes.review.fire('submit');await settle();
 const item=nodes.receipts.children[0];assert.equal(item.children[0].textContent,row.display_name+' · clean');
 assert.equal(item.children[1].href,'/api/platform/billing/pop/download?documentId=doc&tenantId=tenant&orderId=order');
});
test('staging wrapper serves UI only after fixed origin/profile/resource/source gate; production remains denied',async()=>{
 const origin='https://pop-staging.thebedesk.com',entry=createPopHttpStagingEntry({fetch:()=>{throw Error('UI must not delegate')}});
 const env={APP_ENV:'staging',DEPLOYMENT_PROFILE:'pop-http-staging',PUBLIC_ORIGIN:origin,PUBLIC_APP_URL:origin,POP_HTTP_STAGING_D1_ID:'812f9021-890b-41e6-8fa1-6001f90a9b53',POP_HTTP_STAGING_SOURCE_SHA:'a'.repeat(40)};
 assert.equal((await entry.fetch(new Request(origin+'/pop/'),env)).status,200);
 assert.equal((await entry.fetch(new Request(origin+'/pop/'),{...env,APP_ENV:'production'})).status,503);
 assert.equal((await entry.fetch(new Request('https://foreign.example.com/pop/'),env)).status,403);
});
