import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/workspace-lazy-hydration-retry-v535.js','utf8');
const releaseSha='a'.repeat(40);

assert.match(source,/20261016-workspace-lazy-hydration-retry-v535/,'Release 535 retry watchdog has an explicit release identity');
assert.match(source,/MAX_RECOVERY_ATTEMPTS=3/,'Release 535 recovery is strictly bounded to three attempts');
assert.match(source,/workspace-view-fragments-20261001a-/,'Release 535 retries the deterministic canonical shard first');
assert.match(source,/workspace-view-fragments-20261001a\.json/,'Release 535 retains the canonical all-view manifest fallback');
assert.match(source,/data-lazy-recovery-error/,'Release 535 waits for the existing systemic recovery layer to fail before taking over');
assert.match(source,/globalThis\.BW\?\.api\?\.createClient/,'Release 535 uses centralized API transport');
assert.match(source,/globalThis\.BW\?\.dom\?\.renderMarkup/,'Release 535 requires the safe DOM renderer');
assert.doesNotMatch(source,/\.innerHTML\s*=/,'Release 535 never bypasses safe DOM rendering');
assert.doesNotMatch(source,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,'Release 535 retry watchdog remains read-only');

const appHtml=versionReleaseAssets('<html><head></head><body><main>App</main></body></html>',releaseSha,{includeWorkspaceFixes:true});
assert(appHtml.includes('/js/workspace-lazy-hydration-recovery-v533.js?release='+releaseSha),'existing Release 533 recovery remains installed');
assert(appHtml.includes('/js/workspace-lazy-hydration-retry-v535.js?release='+releaseSha),'Release 535 retry watchdog is SHA-bound on the private app');
assert(appHtml.indexOf('workspace-lazy-hydration-recovery-v533.js')<appHtml.indexOf('workspace-lazy-hydration-retry-v535.js'),'Release 533 gets the first recovery attempt before Release 535 watchdog');
assert(appHtml.indexOf('workspace-lazy-hydration-retry-v535.js')<appHtml.indexOf('account-lazy-hydration-v532.js'),'Release 535 watchdog loads before legacy route-specific recovery layers');
assert.equal((appHtml.match(/workspace-lazy-hydration-retry-v535\.js/g)||[]).length,1,'Release 535 injection is idempotent');
assert.equal(versionReleaseAssets(appHtml,releaseSha,{includeWorkspaceFixes:true}),appHtml,'Release 535 decoration remains idempotent');
const publicHtml=versionReleaseAssets('<html><head></head><body>Public</body></html>',releaseSha,{includeWorkspaceFixes:false});
assert.equal(publicHtml.includes('workspace-lazy-hydration-retry-v535.js'),false,'public surface does not receive the private retry watchdog');

function makeRoot(){
  const attributes=new Map();
  const events=[];
  return {
    id:'audit',
    dataset:{lazyView:'1',lazyError:'1',lazyRecoveryError:'1',lazyViewId:'audit'},
    attributes,
    events,
    rendered:null,
    classList:{contains(name){return name==='active';}},
    setAttribute(name,value){attributes.set(name,String(value));},
    removeAttribute(name){
      attributes.delete(name);
      if(name==='data-lazy-view')delete this.dataset.lazyView;
      if(name==='data-lazy-view-id')delete this.dataset.lazyViewId;
    },
    dispatchEvent(event){events.push(event);return true;}
  };
}

async function settle(timers,limit=30){
  for(let cycle=0;cycle<limit;cycle++){
    await Promise.resolve();
    await Promise.resolve();
    if(timers.length){
      const timer=timers.shift();
      if(!timer.cancelled)timer.fn();
      continue;
    }
    await new Promise(resolve=>setImmediate(resolve));
    if(!timers.length){
      await Promise.resolve();
      if(!timers.length)return;
    }
  }
  throw new Error('retry test did not settle within bounded cycles');
}

async function runScenario(outcomes){
  const root=makeRoot();
  const requests=[];
  const clientConfigs=[];
  const timers=[];
  const showCalls=[];
  let nextTimerId=1;
  const timerById=new Map();
  const queue=[...outcomes];
  const successMarkup='<section data-test="audit-recovered">Activity history recovered</section>';

  const document={
    readyState:'complete',
    body:{},
    querySelector(selector){
      if(selector==='meta[name="thebe-assets-release"]')return {content:releaseSha};
      return null;
    },
    querySelectorAll(selector){
      if(selector.includes('data-lazy-recovery-error')&&root.dataset.lazyView==='1'&&root.dataset.lazyError==='1'&&root.dataset.lazyRecoveryError==='1')return [root];
      return [];
    },
    addEventListener(){throw new Error('DOMContentLoaded listener should not be needed for ready document');}
  };

  class MutationObserver{constructor(callback){this.callback=callback;}observe(){}}
  class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}

  const context={
    document,
    window:{location:{origin:'https://thebedesk.com'}},
    URL,
    MutationObserver,
    CustomEvent,
    console:{warn(){}},
    queueMicrotask,
    setTimeout(fn,delay){
      const timer={id:nextTimerId++,fn,delay:Number(delay)||0,cancelled:false};
      timers.push(timer);timerById.set(timer.id,timer);return timer.id;
    },
    clearTimeout(id){const timer=timerById.get(id);if(timer)timer.cancelled=true;},
    showView(id,options){showCalls.push({id,options});},
    BW:{
      api:{createClient(config){
        clientConfigs.push(config);
        return {async request(asset,options){
          requests.push({asset,options});
          const outcome=queue.length?queue.shift():'fail';
          if(outcome==='fail')throw new Error('synthetic_transient_fragment_failure');
          if(outcome==='manifest')return {schema:1,views:{audit:successMarkup}};
          return {schema:2,shard:7,views:{audit:successMarkup}};
        }};
      }},
      dom:{renderMarkup(target,markup){target.rendered=markup;}}
    }
  };

  vm.runInNewContext(source,context,{filename:'workspace-lazy-hydration-retry-v535.js'});
  await settle(timers);
  return {root,requests,clientConfigs,showCalls,timers,successMarkup};
}

const recovered=await runScenario(['fail','fail','shard']);
assert.equal(recovered.requests.length,3,'first failed shard+manifest cycle is followed by one successful shard retry');
assert.match(recovered.requests[0].asset,/workspace-view-fragments-20261001a-7\.json\?release=/,'Activity history retry starts with deterministic shard 7');
assert.match(recovered.requests[1].asset,/workspace-view-fragments-20261001a\.json\?release=/,'failed shard falls back to canonical manifest');
assert.match(recovered.requests[2].asset,/workspace-view-fragments-20261001a-7\.json\?release=/,'next bounded attempt returns to the smaller deterministic shard first');
for(const request of recovered.requests){
  assert.equal(request.options.method,'GET','every retry request is read-only GET');
  assert.equal(request.options.cache,'reload','every retry request revalidates the release-bound asset');
}
assert(recovered.clientConfigs.every(config=>config.timeoutMs===8000&&config.retries===1),'each attempt resolves a fresh bounded centralized API client');
assert.equal(recovered.root.dataset.lazyHydrated,'1','transient double-source failure eventually hydrates the lazy route');
assert.equal(recovered.root.dataset.lazyError,undefined,'successful retry clears native lazy error');
assert.equal(recovered.root.dataset.lazyRecoveryError,undefined,'successful retry clears v533 recovery error');
assert.equal(recovered.root.dataset.lazyRetryError,undefined,'successful retry clears retry error state');
assert.equal(recovered.root.dataset.lazyView,undefined,'successful retry retires the lazy marker');
assert.equal(recovered.root.rendered,recovered.successMarkup,'successful retry renders canonical markup through the safe DOM layer');
assert.equal(recovered.showCalls.length,1,'active recovered view returns to the normal showView lifecycle exactly once');
assert.deepEqual(recovered.showCalls[0],{id:'audit',options:{lazyHydrated:true,preserveNavigationEpoch:true}},'showView handoff preserves navigation epoch semantics');
assert.equal(recovered.root.events.at(-1)?.type,'thebe:lazy-view-hydrated','successful retry emits the standard hydration event');

const bounded=await runScenario(['fail','fail','fail','fail','fail','fail','shard']);
assert.equal(bounded.requests.length,6,'three bounded attempts make at most shard+manifest requests and never consume a fourth-attempt success');
assert.equal(bounded.root.dataset.lazyHydrated,undefined,'exhausted recovery does not falsely mark the view hydrated');
assert.equal(bounded.root.dataset.lazyError,'1','exhausted recovery preserves fail-closed lazy error state');
assert.equal(bounded.root.dataset.lazyRecoveryError,'1','exhausted recovery preserves original systemic recovery evidence');
assert.equal(bounded.root.dataset.lazyRetryError,'1','exhausted recovery records retry failure evidence');
assert.equal(bounded.root.dataset.lazyRetryAttempt,'3','exhausted recovery records the final bounded attempt number');
assert.equal(bounded.showCalls.length,0,'exhausted recovery never re-enters showView');
assert.equal(bounded.timers.length,0,'exhausted recovery leaves no unbounded retry timer');

console.log('PASS: Release 535 lazy hydration retry watchdog is app-scoped, read-only, deterministic-shard-first, transient-failure recoverable and strictly bounded');
