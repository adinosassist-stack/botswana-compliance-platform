/* Default-off asset register renderer. Host owns authenticated data retrieval. */
(function(global){
 'use strict';
 function mount({host,capability,loadAssets,onOpenAsset}={}){
  if(!host||capability?.enabled!==true||capability?.authenticated!==true||capability?.tenantAuthorized!==true||typeof loadAssets!=='function')return null;
  const existing=host.querySelector('[data-thebe-assets-register="1"]');if(existing)return existing;
  const root=document.createElement('section');root.className='thebe-assets-register';root.dataset.thebeAssetsRegister='1';
  root.setAttribute('aria-label','Asset register');
  const title=document.createElement('h3');title.textContent='Asset register';
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh';
  const status=document.createElement('p');status.setAttribute('role','status');
  const table=document.createElement('table');
  const caption=document.createElement('caption');caption.textContent='Company assets';table.append(caption);
  const head=document.createElement('thead');const tr=document.createElement('tr');
  for(const name of ['Asset','Category','Branch','Status','Book value']){const th=document.createElement('th');th.scope='col';th.textContent=name;tr.append(th)}
  head.append(tr);table.append(head);const body=document.createElement('tbody');table.append(body);
  root.append(title,refresh,status,table);host.append(root);
  let busy=false;
  const currency=new Intl.NumberFormat('en-BW',{style:'currency',currency:'BWP'});
  async function reload(){
   if(busy)return;busy=true;refresh.disabled=true;status.textContent='Loading assets…';
   try{
    const result=await loadAssets();
    if(!result||!Array.isArray(result.assets)||result.assets.length>100)throw new Error('invalid_assets');
    const fragment=document.createDocumentFragment();
    for(const asset of result.assets){
     if(!asset||typeof asset.name!=='string'||asset.name.length>255||typeof asset.category!=='string'||typeof asset.branch!=='string'||typeof asset.status!=='string'||typeof asset.bookValueBwp!=='number'||!Number.isFinite(asset.bookValueBwp)||asset.bookValueBwp<0)throw new Error('invalid_asset');
     const row=document.createElement('tr');
     for(const value of [asset.name,asset.category,asset.branch,asset.status,currency.format(asset.bookValueBwp)]){
      const cell=document.createElement('td');cell.textContent=value;row.append(cell);
     }
     if(typeof onOpenAsset==='function'&&typeof asset.id==='string'){
      row.tabIndex=0;row.setAttribute('aria-label','Open asset '+asset.name);
      row.addEventListener('click',()=>onOpenAsset(asset.id));
      row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpenAsset(asset.id)}});
     }
     fragment.append(row);
    }
    body.replaceChildren(fragment);
    status.textContent=result.assets.length===0?'No assets recorded':result.assets.length+' assets shown';
   }catch{body.replaceChildren();status.textContent='Asset register unavailable';}
   finally{busy=false;refresh.disabled=false}
  }
  refresh.addEventListener('click',reload);void reload();return root;
 }
 global.ThebeAssetsRegister=Object.freeze({mount});
})(window);
