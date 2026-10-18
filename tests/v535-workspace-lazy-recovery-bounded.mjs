import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const recovery=fs.readFileSync('public/js/workspace-lazy-hydration-recovery-v533.js','utf8');

assert.match(recovery,/const RETRY_DELAYS_MS=Object\.freeze\(\[150,300,600,1000,1500,2000,2500,3000\]\)/,'systemic recovery must use a finite retry schedule');
assert.match(recovery,/const retryState=new WeakMap\(\)/,'retry state must remain per-view and garbage-collectable');
assert.match(recovery,/state\.attempts>=RETRY_DELAYS_MS\.length/,'retry budget must fail closed at a finite bound');
assert.match(recovery,/root\.dataset\.lazyRecoveryExhausted='1'/,'exhausted recovery must expose an explicit terminal state');
assert.match(recovery,/root\.dataset\.lazyError='1'/,'exhausted recovery must restore the canonical lazy error state');
assert.match(recovery,/delete root\.dataset\.lazyError[\s\S]*root\.dataset\.lazyRecovery='1'[\s\S]*root\.setAttribute\('aria-busy','true'\)/,'fallback must synchronously claim the canonical terminal error while bounded recovery is active');
assert.match(recovery,/scheduleRetry\(root\)/,'failed recovery must enter the bounded retry path');
assert.match(recovery,/data-lazy-recovery-exhausted=\\?"1\\?"/,'scan must exclude views whose recovery budget is exhausted');
// Exercise the observer rather than binding this guard to optional-chaining syntax.
let observeMutation;
let scheduledRetries=0;
vm.runInNewContext(recovery,{
  document:{readyState:'complete',body:{},querySelectorAll:()=>[]},
  MutationObserver:class {
    constructor(callback){observeMutation=callback;}
    observe(){}
  },
  queueMicrotask:callback=>callback(),
  setTimeout:()=>{scheduledRetries++;return scheduledRetries;},
  clearTimeout:()=>{},
  console:{warn(){}},
});
const exhausted={isConnected:true,dataset:{lazyView:'1',lazyError:'1',lazyRecoveryExhausted:'1'}};
observeMutation([{type:'attributes',attributeName:'data-lazy-error',target:exhausted}]);
assert.equal(scheduledRetries,0,'observer must not restart an exhausted recovery loop');
assert.equal(exhausted.dataset.lazyRecoveryExhausted,'1','exhaustion must remain terminal');
const recoverable={isConnected:true,id:'peopleops',dataset:{lazyView:'1',lazyError:'1'},setAttribute(){}};
observeMutation([{type:'attributes',attributeName:'data-lazy-error',target:recoverable}]);
assert.equal(scheduledRetries,1,'a recoverable view must still schedule its bounded retry');
assert.match(recovery,/globalThis\.BW\?\.dom\?\.renderMarkup/,'recovery must preserve the sanctioned DOM renderer');
assert.match(recovery,/globalThis\.BW\?\.api\?\.createClient/,'recovery must preserve the centralized same-origin transport');
assert.match(recovery,/client\.request\(releaseBoundAsset\(\),\{method:'GET',cache:'reload'\}\)/,'recovery must remain read-only and release-bound');
assert.match(recovery,/root\.removeAttribute\('data-lazy-view'\)/,'successful recovery must remove the lazy marker');
assert.match(recovery,/clearRetry\(root\)[\s\S]*thebe:lazy-view-hydrated/,'successful hydration must clear retry state before announcing completion');
assert.doesNotMatch(recovery,/\.innerHTML\s*=/,'recovery must not bypass DOM sanitization');
assert.doesNotMatch(recovery,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,'recovery must not introduce mutation requests');

const claimIndex=recovery.indexOf('delete root.dataset.lazyError;');
const renderIndex=recovery.indexOf("const renderMarkup=globalThis.BW?.dom?.renderMarkup;");
const fetchIndex=recovery.indexOf('const views=await manifestViews();');
assert(claimIndex>=0&&renderIndex>claimIndex&&fetchIndex>renderIndex,'terminal lazy error must be claimed before dependency or network recovery can yield');

console.log('Release 535 bounded systemic lazy recovery regression: PASS');
