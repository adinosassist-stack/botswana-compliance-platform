(()=>{
  'use strict';

  const RELEASE='20261016-protect-lazy-hydration-v528';
  const ROOT_ID='protecthub';
  const VIEW_ID='protecthub';
  const SHARD=10;
  const FRAGMENT_ASSET='/assets/workspace-view-fragments-20261016a-10.json';
  const MAX_ATTEMPTS=40;
  const RETRY_MS=50;
  let running=false;
  let complete=false;
  let activeObserver=null;

  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function releaseBoundAsset(){
    const release=document.querySelector('meta[name="thebe-assets-release"]')?.content||'';
    if(!/^[0-9a-f]{40}$/.test(release))return FRAGMENT_ASSET;
    const url=new URL(FRAGMENT_ASSET,window.location.origin);
    url.searchParams.set('release',release);
    return url.pathname+url.search;
  }

  async function hydrateProtect(){
    if(complete||running)return complete;
    const root=document.getElementById(ROOT_ID);
    if(!root)return false;
    if(root.dataset.lazyHydrated==='1'&&!root.hasAttribute('data-lazy-view')){
      complete=true;
      return true;
    }
    if(!root.hasAttribute('data-lazy-view'))return false;
    if(!root.classList.contains('active'))return false;

    const createClient=globalThis.BW?.api?.createClient;
    const renderMarkup=globalThis.BW?.dom?.renderMarkup;
    if(typeof createClient!=='function'||typeof renderMarkup!=='function')return false;

    running=true;
    try{
      const client=createClient({timeoutMs:6000,retries:1});
      const payload=await client.request(releaseBoundAsset(),{method:'GET',cache:'reload'});
      if(Number(payload?.schema)!==2||Number(payload?.shard)!==SHARD||!payload?.views||typeof payload.views!=='object')throw new Error('protect_fragment_payload_invalid');
      const markup=payload.views[VIEW_ID];
      if(typeof markup!=='string'||markup.trim()==='')throw new Error('protect_fragment_markup_missing');

      // Normal hydration may have won, or navigation may have left this route.
      if(!root.hasAttribute('data-lazy-view')){complete=true;return true;}
      if(!root.classList.contains('active'))return false;
      renderMarkup(root,markup);
      root.dataset.lazyHydrated='1';
      delete root.dataset.lazyError;
      root.removeAttribute('data-lazy-view');
      root.removeAttribute('data-lazy-view-id');
      root.setAttribute('aria-busy','false');
      root.dataset.protectHydrationRelease=RELEASE;
      complete=true;
      root.dispatchEvent(new CustomEvent('thebe:lazy-view-hydrated',{detail:{id:VIEW_ID,source:RELEASE}}));
      return true;
    }catch(error){
      console.warn('Protect recovery hydration deferred:',String(error?.message||error||'unknown_error'));
      return false;
    }finally{
      running=false;
    }
  }

  async function boot(){
    for(let attempt=0;attempt<MAX_ATTEMPTS;attempt+=1){
      const root=document.getElementById(ROOT_ID);
      if(root&&!activeObserver&&typeof MutationObserver==='function'){
        activeObserver=new MutationObserver(()=>{if(root.classList.contains('active'))void boot();});
        activeObserver.observe(root,{attributes:true,attributeFilter:['class']});
      }
      if(root&&!root.classList.contains('active'))return;
      if(await hydrateProtect())return;
      await delay(RETRY_MS);
    }
  }

  window.addEventListener('thebe:workspace-view-change',event=>{if(event.detail?.id===VIEW_ID)void boot();});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else queueMicrotask(boot);
})();
