(()=>{
  'use strict';

  const RELEASE='20261016-workspace-lazy-hydration-recovery-v535';
  const MANIFEST_ASSET='/assets/workspace-view-fragments-20261001a.json';
  const RETRY_DELAYS_MS=Object.freeze([150,300,600,1000,1500,2000,2500,3000]);
  const pending=new WeakSet();
  const retryState=new WeakMap();
  let manifestPromise=null;

  function releaseBoundAsset(){
    const release=document.querySelector('meta[name="thebe-assets-release"]')?.content||'';
    if(!/^[0-9a-f]{40}$/.test(release))return MANIFEST_ASSET;
    const url=new URL(MANIFEST_ASSET,window.location.origin);
    url.searchParams.set('release',release);
    return url.pathname+url.search;
  }

  async function manifestViews(){
    if(manifestPromise)return manifestPromise;
    const createClient=globalThis.BW?.api?.createClient;
    if(typeof createClient!=='function')throw new Error('workspace_fragment_transport_unavailable');
    const client=createClient({timeoutMs:8000,retries:1});
    manifestPromise=client.request(releaseBoundAsset(),{method:'GET',cache:'reload'}).then(payload=>{
      if(Number(payload?.schema)!==1||!payload?.views||typeof payload.views!=='object')throw new Error('workspace_fragment_manifest_invalid');
      return payload.views;
    }).catch(error=>{
      manifestPromise=null;
      throw error;
    });
    return manifestPromise;
  }

  function eligible(root){
    return !!root&&root.isConnected&&root.dataset.lazyView==='1'&&root.dataset.lazyHydrated!=='1';
  }

  function stateFor(root){
    let state=retryState.get(root);
    if(!state){
      state={attempts:0,timer:null};
      retryState.set(root,state);
    }
    return state;
  }

  function clearRetry(root){
    const state=retryState.get(root);
    if(state?.timer)clearTimeout(state.timer);
    retryState.delete(root);
    if(root){
      delete root.dataset.lazyRecoveryExhausted;
      delete root.dataset.lazyRecoveryAttempt;
    }
  }

  function scheduleRetry(root){
    if(!eligible(root)){
      clearRetry(root);
      return false;
    }
    const state=stateFor(root);
    if(state.timer)return true;
    if(state.attempts>=RETRY_DELAYS_MS.length){
      root.dataset.lazyRecoveryExhausted='1';
      root.dataset.lazyError='1';
      root.setAttribute('aria-busy','false');
      console.warn('workspace_lazy_view_recovery_exhausted',{view:String(root.dataset.lazyViewId||root.id||''),attempts:state.attempts});
      return false;
    }
    const delay=RETRY_DELAYS_MS[state.attempts];
    state.timer=setTimeout(()=>{
      state.timer=null;
      state.attempts+=1;
      root.dataset.lazyRecoveryAttempt=String(state.attempts);
      void recover(root,true);
    },delay);
    return true;
  }

  async function recover(root,fromRetry=false){
    if(!eligible(root)||pending.has(root))return false;
    const state=stateFor(root);
    if(state.attempts>=RETRY_DELAYS_MS.length&&fromRetry)return false;
    if(!fromRetry&&root.dataset.lazyError!=='1'&&state.attempts===0)return false;

    const id=String(root.dataset.lazyViewId||root.id||'').trim();
    if(!id)return false;

    // Once fallback recovery owns this failure, lazy-error is no longer terminal.
    // Keep the view busy while bounded retries run and only restore lazy-error
    // when the retry budget is exhausted. This prevents production probes and
    // users from observing a stale terminal error while recovery is active.
    delete root.dataset.lazyError;
    delete root.dataset.lazyRecoveryExhausted;
    root.dataset.lazyRecovery='1';
    root.setAttribute('aria-busy','true');

    const renderMarkup=globalThis.BW?.dom?.renderMarkup;
    if(typeof renderMarkup!=='function'){
      root.dataset.lazyRecoveryError='1';
      delete root.dataset.lazyRecovery;
      scheduleRetry(root);
      return false;
    }

    pending.add(root);
    try{
      const views=await manifestViews();
      const markup=Object.prototype.hasOwnProperty.call(views,id)?views[id]:null;
      if(typeof markup!=='string'||markup.trim()==='')throw new Error('workspace_fragment_markup_missing');

      renderMarkup(root,markup);
      root.dataset.lazyHydrated='1';
      root.dataset.workspaceHydrationRelease=RELEASE;
      delete root.dataset.lazyError;
      delete root.dataset.lazyLoading;
      delete root.dataset.lazyRecoveryError;
      delete root.dataset.lazyRecovery;
      root.removeAttribute('data-lazy-view');
      root.removeAttribute('data-lazy-view-id');
      root.setAttribute('aria-busy','false');
      clearRetry(root);
      root.dispatchEvent(new CustomEvent('thebe:lazy-view-hydrated',{detail:{id,source:RELEASE}}));

      if(root.classList.contains('active')&&typeof globalThis.showView==='function'){
        queueMicrotask(()=>{
          try{globalThis.showView(id,{lazyHydrated:true,preserveNavigationEpoch:true});}catch(error){console.warn('workspace_lazy_recovery_show_view_failed',{view:id,error});}
        });
      }
      return true;
    }catch(error){
      root.dataset.lazyRecoveryError='1';
      console.warn('workspace_lazy_view_recovery_failed',{view:id,attempt:state.attempts,error});
      scheduleRetry(root);
      return false;
    }finally{
      pending.delete(root);
      if(root.dataset.lazyHydrated!=='1')delete root.dataset.lazyRecovery;
    }
  }

  function scan(){
    document.querySelectorAll('[data-lazy-view="1"][data-lazy-error="1"]').forEach(root=>{void recover(root);});
  }

  function boot(){
    scan();
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes'&&record.attributeName==='data-lazy-error'){
          const root=record.target;
          if(root?.dataset?.lazyError==='1'){
            const state=retryState.get(root);
            if(state?.attempts>=RETRY_DELAYS_MS.length)clearRetry(root);
            void recover(root);
          }
          continue;
        }
        if(record.type==='childList')scan();
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-lazy-error']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else queueMicrotask(boot);
})();
