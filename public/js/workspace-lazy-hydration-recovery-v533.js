(()=>{
  'use strict';

  const RELEASE='20261016-workspace-lazy-hydration-recovery-v533';
  const MANIFEST_ASSET='/assets/workspace-view-fragments-20261001a.json';
  const pending=new WeakSet();
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

  async function recover(root){
    if(!root||pending.has(root)||root.dataset.lazyHydrated==='1')return false;
    if(root.dataset.lazyView!=='1'||root.dataset.lazyError!=='1')return false;
    const id=String(root.dataset.lazyViewId||root.id||'').trim();
    if(!id)return false;
    const renderMarkup=globalThis.BW?.dom?.renderMarkup;
    if(typeof renderMarkup!=='function')return false;

    pending.add(root);
    root.dataset.lazyRecovery='1';
    root.setAttribute('aria-busy','true');
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
      root.removeAttribute('data-lazy-view');
      root.removeAttribute('data-lazy-view-id');
      root.setAttribute('aria-busy','false');
      root.dispatchEvent(new CustomEvent('thebe:lazy-view-hydrated',{detail:{id,source:RELEASE}}));

      if(root.classList.contains('active')&&typeof globalThis.showView==='function'){
        queueMicrotask(()=>{
          try{globalThis.showView(id,{lazyHydrated:true,preserveNavigationEpoch:true});}catch(error){console.warn('workspace_lazy_recovery_show_view_failed',{view:id,error});}
        });
      }
      return true;
    }catch(error){
      root.dataset.lazyRecoveryError='1';
      root.setAttribute('aria-busy','false');
      console.warn('workspace_lazy_view_recovery_failed',{view:id,error});
      return false;
    }finally{
      delete root.dataset.lazyRecovery;
      pending.delete(root);
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
          void recover(record.target);
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
