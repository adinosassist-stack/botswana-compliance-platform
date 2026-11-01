(()=>{
 'use strict';
 const ROOT='/api/corporate-assets',categories={fleet:'Fleet',it:'IT hardware',machinery:'Machinery',furniture:'Furniture',other:'Other'},statuses={active:'Active',maintenance:'In maintenance',written_off:'Written off',decommissioned:'Decommissioned'};
 const kinds={service:'Routine service',repair:'Repair',insurance:'Insurance renewal',warranty:'Warranty claim'};
 let root,rows=[],cursor=null,cursors=[''],page=0,busy=false,epoch=0,search='',filter='';
 const identity=()=>{try{return typeof currentUser==='object'&&currentUser?currentUser:null}catch{return null}};
 const key=()=>{const u=identity();return u?`${u.id}:${u.tenantId}:${u.role}`:''};
 const allowed=()=>['owner','manager'].includes(identity()?.role);
 const money=n=>'P '+(Number(n)/100).toLocaleString('en-BW',{minimumFractionDigits:2,maximumFractionDigits:2});
 const make=(tag,cls,content)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=content;return el};
 const button=(label,fn,cls='btn alt')=>{const b=make('button',cls,label);b.type='button';b.addEventListener('click',fn);return b};
 const api=(path,options={})=>globalThis.apiJson(path,options);
 const status=message=>{root.querySelector('[data-assets-status]').textContent=message};
 const current=(token,who)=>token===epoch&&who===key()&&allowed()&&root.classList.contains('active');
 function disableWrites(disabled){root.querySelectorAll('[data-asset-write]').forEach(b=>{b.disabled=disabled})}
 function metrics(summary={}){
  const box=root.querySelector('.asset-metrics');box.replaceChildren();
  for(const [label,value] of [['Registered assets',summary.total??'—'],['Recorded book value',summary.bookValueMinor===undefined?'—':money(summary.bookValueMinor)],['In maintenance',summary.maintenance??'—'],['Due / overdue in 30 days',summary.due??'—']]){
   const card=make('article','card asset-metric');card.append(make('span','muted small',label),make('strong','',String(value)));box.append(card);
  }
  const mix=root.querySelector('.asset-distribution');if(mix){mix.replaceChildren();if(summary.total>0){mix.append(make('h3','','Asset mix'));for(const row of summary.byCategory||[]){const item=make('div','asset-mix-row'),label=make('div','between row');label.append(make('span','small',categories[row.category]||'Other'),make('strong','small',String(row.count)));const track=make('div','asset-bar'),bar=make('span');bar.style.width=Math.round(row.count/summary.total*100)+'%';track.append(bar);item.append(label,track);mix.append(item)}}}
 }
 function visibleRows(){return rows.filter(a=>(!filter||a.category===filter)&&[a.name,a.serial,a.branch,a.custodian].join(' ').toLowerCase().includes(search))}
 function renderRows(){
  const box=root.querySelector('.asset-list');box.replaceChildren();
  const list=visibleRows();root.querySelector('[data-result-count]').textContent=`${list.length} shown · page ${page+1}`;
  if(!list.length){const empty=make('div','asset-empty');empty.append(make('h3','','No assets to show'),make('p','muted',rows.length?'Try another search or category.':'Register equipment, vehicles or furniture to start your company register.'));box.append(empty);return}
  for(const a of list){
   const row=make('article','asset-row'),name=make('div','asset-name');name.append(make('strong','',a.name),make('span','muted small',a.serial||'No serial recorded'));
   const details=make('div','asset-description');details.append(make('span','',`${categories[a.category]} · ${a.branch}`),make('small','muted',a.custodian||'No custodian assigned'));
   const value=make('div','asset-value');value.append(make('strong','',money(a.book_value_minor)),make('span','badge',statuses[a.status]));
   const actions=make('div','asset-actions');actions.append(button('Edit',()=>assetForm(a)),button('Service / renewal',()=>serviceForm(a)),button('History',()=>history(a)));
   row.append(name,details,value,actions);box.append(row);
  }
 }
 async function load({reset=false}={}){
  if(!allowed()||!root?.classList.contains('active'))return;
  if(reset){page=0;cursors=['']}
  const token=++epoch,who=key();rows=[];renderRows();metrics();disableWrites(true);root.querySelector('.asset-schedule').replaceChildren();status('Loading assets…');
  try{
   const result=await api(ROOT+'?after='+encodeURIComponent(cursors[page]||''));if(!current(token,who))return;
   rows=result.items;cursor=result.nextCursor;metrics(result.summary);renderRows();
   root.querySelector('[data-next]').disabled=!cursor;root.querySelector('[data-back]').disabled=page===0;disableWrites(false);status('');
   const schedule=await api(ROOT+'/schedule');if(!current(token,who))return;renderSchedule(schedule);
  }catch(error){if(!current(token,who))return;status(['assets_unavailable','assets_not_ready'].includes(error.code||error.data?.error)?'Assets is not available in this workspace yet.':'Could not load assets. Use Refresh to try again.');root.querySelector('[data-next]').disabled=true;root.querySelector('[data-back]').disabled=true;}
 }
 function renderSchedule(data){
  const box=root.querySelector('.asset-schedule');box.replaceChildren();
  if(!data.items.length)box.append(make('p','muted','No maintenance or insurance dates recorded.'));
  const today=data.businessDate||new Date().toISOString().slice(0,10);
  for(const item of data.items){const row=make('div','asset-event');row.append(make('strong','',item.asset_name),make('span','muted small',`${kinds[item.kind]} · ${item.due_on}`),make('span',item.due_on<today?'badge warn':'badge',item.due_on<today?'Overdue':'Scheduled'));box.append(row)}
  if(data.truncated)box.append(make('p','muted small','Showing the earliest 100 dates.'));
 }
 function dialog(title){
  const d=make('dialog','corporate-asset-dialog'),heading=make('h2','',title),form=make('form','asset-form'),message=make('p','muted small');
  d.dataset.assetSession=key();heading.id='corporateAssetDialogHeading';d.setAttribute('aria-labelledby',heading.id);message.setAttribute('role','status');
  d.append(heading,form,message);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});
  const actions=make('div','asset-form-actions');actions.append(button('Cancel',()=>d.close()));const submit=make('button','btn','Save');submit.type='submit';actions.append(submit);
  return {d,form,message,actions,submit};
 }
 function field(form,label,name,{value='',type='text',options=null,required=false,maxLength=160}={}){
  const wrap=make('label','asset-field',label),control=make(options?'select':'input');control.name=name;
  if(options){for(const [k,v] of Object.entries(options)){const o=make('option','',v);o.value=k;control.append(o)}}else{control.type=type;control.maxLength=maxLength;if(type==='number'){control.min='0';control.max='9999999999.99';control.step='0.01'}}
  control.value=String(value);control.required=required;wrap.append(control);form.append(wrap);return control;
 }
 function minor(value){if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw Error('Enter a nonnegative BWP amount with at most two decimal places.');const [whole,part='']=value.split('.');const n=Number(whole)*100+Number(part.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>999999999999)throw Error('Amount exceeds the supported range.');return n}
 async function commit(dialogInfo,path,method,body,who){
  if(busy)return;busy=true;dialogInfo.submit.disabled=true;dialogInfo.message.textContent='Saving…';
  try{if(who!==key()||!allowed())throw Error('Your workspace session changed. Close this form and reload.');await api(path,{method,body:JSON.stringify(body)});if(who!==key())return;dialogInfo.d.close();await load({reset:true});status('Saved to your company register.');}
  catch(e){dialogInfo.message.textContent=e.code==='asset_conflict'?'This asset changed in another session. Close this form and refresh before editing again.':e.message||'Save failed. Refresh before trying again.'}
  finally{busy=false;dialogInfo.submit.disabled=false}
 }
 function assetForm(a=null){
  if(!allowed())return;const who=key(),recordId=a?.id||crypto.randomUUID(),ui=dialog(a?'Edit asset':'Register asset'),f=ui.form;
  field(f,'Asset name','name',{value:a?.name,required:true});field(f,'Category','category',{value:a?.category||'fleet',options:categories});field(f,'Branch / location','branch',{value:a?.branch,required:true,maxLength:100});field(f,'Serial / VIN','serial',{value:a?.serial,maxLength:100});field(f,'Custodian','custodian',{value:a?.custodian});field(f,'Acquisition date','acquisitionDate',{value:a?.acquisition_date,type:'date',required:true});
  const owner=identity()?.role==='owner';
  const cost=field(f,'Acquisition cost (BWP)','cost',{value:a?String(a.acquisition_cost_minor/100):'',type:'number',required:true});const book=field(f,'Recorded book value (BWP)','book',{value:a?String(a.book_value_minor/100):'',type:'number',required:true});
  if(a&&!owner){cost.readOnly=true;book.readOnly=true}
  field(f,'Status','status',{value:a?.status||'active',options:owner?statuses:{active:'Active',maintenance:'In maintenance'}});
  if(a&&!owner&&['written_off','decommissioned'].includes(a.status)){ui.d.remove();status('Only an owner can edit a retired asset.');return}
  f.append(make('p','muted small','Book values are recorded amounts, not tax calculations or professional valuations.'),ui.actions);
  f.addEventListener('submit',e=>{e.preventDefault();const b=Object.fromEntries(new FormData(f));try{const body={id:recordId,name:b.name,category:b.category,branch:b.branch,serial:b.serial,custodian:b.custodian,acquisitionDate:b.acquisitionDate,acquisitionCostMinor:minor(b.cost),bookValueMinor:minor(b.book),status:b.status,...(a?{revision:a.revision}:{})};void commit(ui,a?ROOT+'/'+a.id:ROOT,a?'PUT':'POST',body,who)}catch(e){ui.message.textContent=e.message}});ui.d.showModal();
 }
 function serviceForm(a){
  if(!allowed())return;const who=key(),recordId=crypto.randomUUID(),ui=dialog('Service / renewal · '+a.name),f=ui.form;
  field(f,'Type','kind',{value:'service',options:kinds});field(f,'Service / record date','servicedOn',{type:'date',required:true});field(f,'Next due date','dueOn',{type:'date',required:true});field(f,'Cost (BWP)','cost',{value:'0',type:'number',required:true});field(f,'Provider','provider');field(f,'Description','description',{required:true,maxLength:500});f.append(ui.actions);
  f.addEventListener('submit',e=>{e.preventDefault();const b=Object.fromEntries(new FormData(f));try{const costMinor=minor(b.cost);delete b.cost;void commit(ui,ROOT+'/'+a.id+'/services','POST',{...b,id:recordId,costMinor},who)}catch(e){ui.message.textContent=e.message}});ui.d.showModal();
 }
 async function history(a){
  const who=key(),ui=dialog('Asset history · '+a.name);ui.actions.firstChild.textContent='Close';ui.submit.remove();ui.form.append(ui.actions);ui.message.textContent='Loading history…';ui.d.showModal();
  try{const result=await api(ROOT+'/'+a.id+'/history');if(who!==key()||!ui.d.isConnected)return;ui.message.textContent=result.items.length?'':'No history recorded.';for(const e of result.items){const row=make('div','asset-event');row.append(make('strong','',e.event_type.replaceAll('_',' ').toLowerCase()),make('span','muted small',e.occurred_at));ui.form.insertBefore(row,ui.actions)}}catch{ui.message.textContent='Could not load history.'}
 }
 function exportView(){
  const escape=v=>'"'+(/^[\s]*[=+@-]/.test(String(v??''))?"'":'')+String(v??'').replaceAll('"','""')+'"';
  const fields=['name','category','branch','serial','custodian','acquisition_date','acquisition_cost_minor','book_value_minor','status'];
  const content=[fields.join(','),...visibleRows().map(a=>fields.map(k=>escape(a[k])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=make('a');a.href=url;a.download='thebe-assets-current-page-minor-units.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function install(){
  if(!allowed()||document.getElementById('corporateassets'))return;
  const property=document.getElementById('propertyintelligence'),nav=document.querySelector('.nav [data-view="propertyintelligence"]');if(!property||!nav)return;
  const link=button('',()=>{globalThis.showView('corporateassets');globalThis.closeMobileWorkspaceMenu?.()},'nav-primary');const icon=make('span','nav-primary-icon corporate-assets-nav-icon');icon.setAttribute('aria-hidden','true');link.append(icon,make('span','','Assets'));link.dataset.view='corporateassets';link.setAttribute('aria-label','Corporate assets');nav.after(link);
  root=make('section','view simplified-hub corporate-assets');root.id='corporateassets';root.dataset.hubName='Assets';
  const hero=make('div','hub-hero'),copy=make('div');copy.append(make('div','section-eyebrow','Assets'),make('h2','','Keep every company asset accounted for.'),make('p','muted','Equipment, vehicles and furniture — with clear ownership and upkeep.'));
  const add=button('Register asset',()=>assetForm(),'btn');add.dataset.assetWrite='';hero.append(copy,add);root.append(hero,make('div','asset-metrics'));
  const tools=make('div','card asset-tools'),input=make('input');input.type='search';input.placeholder='Search this page';input.setAttribute('aria-label','Search assets on current page');input.addEventListener('input',()=>{search=input.value.trim().toLowerCase();renderRows()});
  const select=make('select');select.setAttribute('aria-label','Asset category');for(const [k,v] of Object.entries({'':'All categories',...categories})){const o=make('option','',v);o.value=k;select.append(o)}select.addEventListener('change',()=>{filter=select.value;renderRows()});tools.append(input,select,button('Refresh',()=>load({reset:true})),button('Export view',exportView));root.append(tools);
  const state=make('p','muted small');state.dataset.assetsStatus='';state.setAttribute('role','status');state.setAttribute('aria-live','polite');root.append(state);
  const columns=make('div','asset-columns'),register=make('div','card');const heading=make('div','between row'),counter=make('span','muted small');counter.dataset.resultCount='';heading.append(make('h3','','Asset register'),counter);register.append(heading,make('div','asset-list'));
  const pager=make('div','asset-actions'),back=button('Previous',()=>{page--;void load()}),next=button('Next',()=>{cursors[++page]=cursor;void load()});back.dataset.back='';next.dataset.next='';back.disabled=next.disabled=true;pager.append(back,next);register.append(pager);
  const schedule=make('div','card');schedule.append(make('div','asset-distribution'),make('h3','','Maintenance & insurance'),make('div','asset-schedule'));columns.append(register,schedule);root.append(columns);property.after(root);metrics();
 }
 globalThis.addEventListener('thebe:workspace-view-change',e=>{
  document.querySelectorAll('.corporate-asset-dialog').forEach(d=>{if(e.detail?.id!=='corporateassets'||d.dataset.assetSession!==key())d.close()});
  ++epoch;if(e.detail?.id==='corporateassets'){install();void load()}else{rows=[];if(root){root.querySelector('.asset-list').replaceChildren();root.querySelector('.asset-schedule').replaceChildren();metrics()}}
 });
 if(typeof globalThis.whenThebeWorkspaceReady==='function')globalThis.whenThebeWorkspaceReady(install);
})();
