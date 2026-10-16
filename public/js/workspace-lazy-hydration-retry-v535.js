(()=>{
  'use strict';

  const RELEASE='20261016-workspace-lazy-hydration-retry-v535';
  const SHARD_PREFIX='/assets/workspace-view-fragments-20261001a-';
  const SHARD_COUNT=12;
  const MANIFEST_ASSET='/assets/workspace-view-fragments-20261001a.json';
  const MAX_RECOVERY_ATTEMPTS=3;
  const RETRY_DELAYS_MS=Object.freeze([0,300,900]);
  const pending=new WeakSet();
  const attempts=new WeakMap();
  const retryTimers=new WeakMap();
  let manifestPromise=null;

  function viewShard(id){
    let hash=0;
    for(const ch of String(id||''))hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;
    return hash%SHARD_COUNT;
  }

  function releaseBoundAsset(asset){
    const release=document.querySelector('meta[name="thebe-assets-release"]')?.content||'';
    if(!/^[0-9a-f]{40}$/.test(release))return asset;
    const url=new URL(asset,window.location.origin);
    url.searchParams.set('release',release);
    return url.pathname+url.search;
  }

  function apiClient(){
    const createClient=globalThis.BW?.api?.createClient;
    if(typeof createClient!=='function')throw new Error('workspace_fragment_transport_unavailable');
    return createClient({timeoutMs:8000,retries:1});
  }

  async function requestJson(asset){
    return apiClient().request(releaseBoundAsset(asset),{method:'GET',cache:'reload'});
  }

  async function shardMarkup(id){
    const shard=viewShard(id);
    const payload=await requestJson(`${SHARD_PREFIX}${shard}.json`);
    if(Number(payload?.schema)!==2||Number(payload?.shard)!==shard||!payload?.views||typeof payload.views!=='object'){
      throw new Error('workspace_fragment_shard_invalid');
    }
    const markup=Object.prototype.hasOwnProperty.call(payload.views,id)?payload.views[id]:null;
    if(typeof markup!=='string'||markup.trim()==='')throw new Error('workspace_fragment_shard_markup_missing');
    return markup;
  }

  async function manifestMarkup(id){
    if(!manifestPromise){
      manifestPromise=requestJson(MANIFEST_ASSET).then(payload=>{
        if(Number(payload?.schema)!==1||!payload?.views||typeof payload.views!=='object')throw new Error('workspace_fragment_manifest_invalid');
        return payload.views;
      }).catch(error=>{
        manifestPromise=null;
        throw error;
      });
    }
    const views=await manifestPromise;
    const markup=Object.prototype.hasOwnProperty.call(views,id)?views[id]:null;
    if(typeof markup!=='string'||markup.trim()==='')throw new Error('workspace_fragment_manifest_markup_missing');
    return markup;
  }

  async function recoveryMarkup(id){
    try{
      return await shardMarkup(id);
    }catch(shardError){
      try{
        return await manifestMarkup(id);
      }catch(manifestError){
        const error=new Error('workspace_fragment_recovery_sources_failed');
        error.shardError=shardError;
        error.manifestError=manifestError;
        throw error;
      }
    }
  }

  function eligible(root){
    return !!root&&root.dataset?.lazyView==='1'&&root.dataset?.lazyError==='1'&&root.dataset?.lazyHydrated!=='1';
  }

  function scheduleRetry(root){
    if(!eligible(root)||pending.has(root)||retryTimers.has(root))return;
    const completed=attempts.get(root)||0;
    if(completed>=MAX_RECOVERY_ATTEMPTS)return;
    const delay=RETRY_DELAYS_MS[Math.min(completed,RETRY_DELAYS_MS.length-1)]||0;
    const timer=setTimeout(()=>{
      retryTimers.delete(root);
      void recover(root);
    },delay);
    retryTimers.set(root,timer);
  }

  async function recover(root){
    if(!eligible(root)||pending.has(root))return false;
    const completed=attempts.get(root)||0;
    if(completed>=MAX_RECOVERY_ATTEMPTS)return false;
    const id=String(root.dataset.lazyViewId||root.id||'').trim();
    if(!id)return false;

    const attempt=completed+1;
    attempts.set(root,attempt);
    pending.add(root);
    root.dataset.lazyRetry='1';
    root.dataset.lazyRetryAttempt=String(attempt);
    root.setAttribute('aria-busy','true');
    let shouldRetry=false;
    try{
      const renderMarkup=globalThis.BW?.dom?.renderMarkup;
      if(typeof renderMarkup!=='function')throw new Error('workspace_fragment_renderer_unavailable');
      const markup=await recoveryMarkup(id);
      renderMarkup(root,markup);
      root.dataset.lazyHydrated='1';
      root.dataset.workspaceHydrationRelease=RELEASE;
      delete root.dataset.lazyError;
      delete root.dataset.lazyLoading;
      delete root.dataset.lazyRecoveryError;
      delete root.dataset.lazyRetryError;
      delete root.dataset.lazyRetryAttempt;
      root.removeAttribute('data-lazy-view');
      root.removeAttribute('data-lazy-view-id');
      root.setAttribute('aria-busy','false');
      attempts.delete(root);
      const timer=retryTimers.get(root);
      if(timer!==undefined){clearTimeout(timer);retryTimers.delete(root);}
      root.dispatchEvent(new CustomEvent('thebe:lazy-view-hydrated',{detail:{id,source:RELEASE,recovered:true}}));
      if(root.classList.contains('active')&&typeof globalThis.showView==='function'){
        queueMicrotask(()=>{
          try{globalThis.showView(id,{lazyHydrated:true,preserveNavigationEpoch:true});}catch(error){console.warn('workspace_lazy_retry_show_view_failed',{view:id,error});}
        });
      }
      return true;
    }catch(error){
      root.dataset.lazyRetryError='1';
      root.setAttribute('aria-busy','false');
      shouldRetry=attempt<MAX_RECOVERY_ATTEMPTS&&eligible(root);
      console.warn('workspace_lazy_view_retry_failed',{view:id,attempt,maxAttempts:MAX_RECOVERY_ATTEMPTS,error});
      return false;
    }finally{
      delete root.dataset.lazyRetry;
      pending.delete(root);
      if(shouldRetry)scheduleRetry(root);
    }
  }

  function scan(){
    document.querySelectorAll('[data-lazy-view="1"][data-lazy-error="1"][data-lazy-recovery-error="1"]').forEach(root=>scheduleRetry(root));
  }

  function boot(){
    scan();
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes'&&record.attributeName==='data-lazy-recovery-error'){
          if(record.target?.dataset?.lazyRecoveryError==='1')scheduleRetry(record.target);
          continue;
        }
        if(record.type==='childList')scan();
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-lazy-recovery-error']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else queueMicrotask(boot);
})();
