/* Default-off maintenance list; host supplies authenticated tenant data. */
(function(global){
 'use strict';
 function mount({host,capability,loadMaintenance}={}){
  if(!host||capability?.enabled!==true||capability?.authenticated!==true||capability?.tenantAuthorized!==true||typeof loadMaintenance!=='function')return null;
  const existing=host.querySelector('[data-thebe-maintenance="1"]');if(existing)return existing;
  const section=document.createElement('section');section.className='thebe-assets-maintenance';section.dataset.thebeMaintenance='1';
  section.setAttribute('aria-label','Asset maintenance');
  const heading=document.createElement('h3');heading.textContent='Maintenance schedule';
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh';
  const status=document.createElement('p');status.setAttribute('role','status');
  const list=document.createElement('ul');section.append(heading,refresh,status,list);host.append(section);
  let loading=false;const currency=new Intl.NumberFormat('en-BW',{style:'currency',currency:'BWP'});
  async function reload(){
   if(loading)return;loading=true;refresh.disabled=true;status.textContent='Loading maintenance…';
   try{
    const result=await loadMaintenance();
    if(!result||!Array.isArray(result.events)||result.events.length>100)throw new Error('invalid_maintenance');
    const fragment=document.createDocumentFragment();
    for(const event of result.events){
     if(!event||typeof event.assetName!=='string'||event.assetName.length>255||typeof event.description!=='string'||event.description.length>2000||typeof event.serviceDate!=='string'||typeof event.costBwp!=='number'||!Number.isFinite(event.costBwp)||event.costBwp<0)throw new Error('invalid_event');
     const item=document.createElement('li');const title=document.createElement('strong');title.textContent=event.assetName;
     const detail=document.createElement('span');detail.textContent=event.description+' · '+event.serviceDate+' · '+currency.format(event.costBwp);
     item.append(title,detail);fragment.append(item);
    }
    list.replaceChildren(fragment);status.textContent=result.events.length?result.events.length+' maintenance records':'No maintenance records';
   }catch{list.replaceChildren();status.textContent='Maintenance unavailable';}
   finally{loading=false;refresh.disabled=false}
  }
  refresh.addEventListener('click',reload);void reload();return section;
 }
 global.ThebeAssetsMaintenance=Object.freeze({mount});
})(window);
