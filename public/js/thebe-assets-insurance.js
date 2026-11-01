/* Read-only, capability-gated insurance renewal panel. */
(function(global){
 'use strict';
 function mount({host,capability,loadInsurance}={}){
  if(!host||capability?.enabled!==true||capability?.authenticated!==true||capability?.tenantAuthorized!==true||typeof loadInsurance!=='function')return null;
  const previous=host.querySelector('[data-thebe-assets-insurance="1"]');if(previous)return previous;
  const root=document.createElement('section');root.className='thebe-assets-insurance';root.dataset.thebeAssetsInsurance='1';
  root.setAttribute('aria-label','Asset insurance');
  const heading=document.createElement('h3');heading.textContent='Insurance renewals';
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh';
  const status=document.createElement('p');status.setAttribute('role','status');
  const list=document.createElement('ul');root.append(heading,refresh,status,list);host.append(root);
  let loading=false;
  async function reload(){
   if(loading)return;loading=true;refresh.disabled=true;status.textContent='Loading policies…';
   try{
    const result=await loadInsurance();if(!result||!Array.isArray(result.policies)||result.policies.length>100)throw new Error('invalid_policies');
    const fragment=document.createDocumentFragment();
    for(const policy of result.policies){
     if(!policy||typeof policy.assetName!=='string'||policy.assetName.length>255||typeof policy.provider!=='string'||policy.provider.length>255||typeof policy.endDate!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(policy.endDate)||!['current','due','expired'].includes(policy.state))throw new Error('invalid_policy');
     const li=document.createElement('li');const name=document.createElement('strong');name.textContent=policy.assetName;
     const details=document.createElement('span');details.textContent=policy.provider+' · Expires '+policy.endDate+' · '+policy.state;
     li.append(name,details);fragment.append(li);
    }
    list.replaceChildren(fragment);status.textContent=result.policies.length?result.policies.length+' policies':'No insurance policies';
   }catch{list.replaceChildren();status.textContent='Insurance information unavailable'}
   finally{loading=false;refresh.disabled=false}
  }
  refresh.addEventListener('click',reload);void reload();return root;
 }
 global.ThebeAssetsInsurance=Object.freeze({mount});
})(window);
