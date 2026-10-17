(()=>{
  'use strict';

  const RELEASE='20261016-account-lazy-hydration-v532';
  const ROOT_ID='accounthub';
  const VIEW_ID='accounthub';
  const SHARD=4;
  const FRAGMENT_ASSET='/assets/workspace-view-fragments-20260929g-4.json';
  const MAX_ATTEMPTS=80;
  const RETRY_MS=75;
  let running=false;
  let complete=false;

  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function releaseBoundAsset(){
    const release=document.querySelector('meta[name="thebe-assets-release"]')?.content||'';
    if(!/^[0-9a-f]{40}$/.test(release))return FRAGMENT_ASSET;
    const url=new URL(FRAGMENT_ASSET,window.location.origin);
    url.searchParams.set('release',release);
    return url.pathname+url.search;
  }

  async function hydrateAccount(){
    if(complete||running)return complete;
    const root=document.getElementById(ROOT_ID);
    if(!root)return false;
    if(root.dataset.lazyHydrated==='1'&&!root.hasAttribute('data-lazy-view')){
      complete=true;
      return true;
    }
    if(!root.hasAttribute('data-lazy-view'))return false;

    const createClient=globalThis.BW?.api?.createClient;
    const renderMarkup=globalThis.BW?.dom?.renderMarkup;
    if(typeof createClient!=='function'||typeof renderMarkup!=='function')return false;

    running=true;
    try{
      const client=createClient({timeoutMs:6000,retries:1});
      const payload=await client.request(releaseBoundAsset(),{method:'GET',cache:'reload'});
      if(Number(payload?.schema)!==2||Number(payload?.shard)!==SHARD||!payload?.views||typeof payload.views!=='object')throw new Error('account_fragment_payload_invalid');
      const markup=payload.views[VIEW_ID];
      if(typeof markup!=='string'||markup.trim()==='')throw new Error('account_fragment_markup_missing');

      renderMarkup(root,markup);
      root.dataset.lazyHydrated='1';
      delete root.dataset.lazyError;
      delete root.dataset.lazyLoading;
      root.removeAttribute('data-lazy-view');
      root.removeAttribute('data-lazy-view-id');
      root.setAttribute('aria-busy','false');
      root.dataset.accountHydrationRelease=RELEASE;
      complete=true;
      root.dispatchEvent(new CustomEvent('thebe:lazy-view-hydrated',{detail:{id:VIEW_ID,source:RELEASE}}));
      return true;
    }catch(error){
      console.warn('Account recovery hydration deferred:',String(error?.message||error||'unknown_error'));
      return false;
    }finally{
      running=false;
    }
  }

  async function boot(){
    for(let attempt=0;attempt<MAX_ATTEMPTS;attempt+=1){
      if(await hydrateAccount())return;
      await delay(RETRY_MS);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else queueMicrotask(boot);
})();
