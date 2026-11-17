import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=readFileSync('public/index.html','utf8');
const head=html.slice(html.indexOf('<head'),html.indexOf('</head>')+7);
const fixture='<!doctype html><html>'+head+'<body><section id="appShell" class="shell"><aside id="workspaceSidebar" aria-label="Workspace navigation"><nav class="nav"><button data-view="dashboard">Home</button><button data-view="propertyintelligence">Property</button><button data-view="peopleops">People</button></nav></aside><main id="mainContent" tabindex="-1"><h1 id="pageTitle">Property</h1><section id="propertyintelligence" class="view active"><div class="card">Property workspace</div></section><section id="peopleops" class="view"><div class="card">People workspace</div></section></main></section><script src="/js/corporate-assets.js"></script><link rel="stylesheet" href="/assets/corporate-assets.css"></body></html>';
const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(p=>existsSync(p)),args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});const f='public'+u.pathname;if(u.pathname.endsWith('.js')&&u.pathname!=='/js/corporate-assets.js')return route.fulfill({contentType:'application/javascript',body:''});return existsSync(f)?route.fulfill({path:f}):route.fulfill({status:404,body:''})});
 await page.addInitScript(()=>{
  window.currentUser={id:'owner-a',tenantId:'tenant-a',role:'owner'};window.calls=[];
  window.whenThebeWorkspaceReady=fn=>document.addEventListener('DOMContentLoaded',fn);
  window.showView=id=>{document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===id));document.getElementById('pageTitle').textContent=id==='corporateassets'?'Assets':id;window.dispatchEvent(new CustomEvent('thebe:workspace-view-change',{detail:{id}}))};
  let item={id:'11111111-1111-4111-8111-111111111111',name:'Delivery truck',category:'fleet',branch:'Gaborone',serial:'TR-001',custodian:'Dispatch',acquisition_date:'2026-01-01',acquisition_cost_minor:20000000,book_value_minor:19000000,status:'active',revision:1};
  let serviceSaved=null,offPageAsset=null;
  window.apiJson=async(path,opts={})=>{
   window.calls.push({path,method:opts.method||'GET'});
   if(opts.method==='PUT'){
    const data=JSON.parse(opts.body);
    item={...item,name:data.name,category:data.category,branch:data.branch,serial:data.serial,custodian:data.custodian,acquisition_date:data.acquisitionDate,acquisition_cost_minor:data.acquisitionCostMinor,book_value_minor:data.bookValueMinor,status:data.status,revision:item.revision+1};
    return {ok:true,id:data.id};
   }
   if(opts.method==='POST'){
    const data=JSON.parse(opts.body);
    if(path.endsWith('/services'))serviceSaved=data;
    if(path==='/api/corporate-assets'&&data.name==='Off-page printer')offPageAsset={
     id:data.id,name:data.name,category:data.category,branch:data.branch,serial:data.serial,custodian:data.custodian,
     acquisition_date:data.acquisitionDate,acquisition_cost_minor:data.acquisitionCostMinor,
     book_value_minor:data.bookValueMinor,status:data.status,revision:1
    };
    // Acknowledgement without a persisted registration should never pass readback.
    return {ok:true,id:data.id};
   }
   if(path.endsWith('/history'))return {items:[...(serviceSaved?[{event_type:'CORPORATE_ASSET_SERVICE_RECORDED',event_data:JSON.stringify(serviceSaved),occurred_at:'2026-11-02T00:00:00Z'}]:[]),{event_type:'CORPORATE_ASSET_CREATED',occurred_at:'2026-11-01T00:00:00Z'}]};
   if(path.endsWith('/schedule'))return {items:[{asset_name:item.name,kind:'insurance',due_on:'2026-12-01'}]};
   if(/^\/api\/corporate-assets\/[a-f0-9-]{36}$/i.test(path)){
    const id=path.split('/').at(-1);
    return {item:id===item.id?item:offPageAsset?.id===id?offPageAsset:null};
   }
   return {items:[item],summary:{total:1,bookValueMinor:19000000,maintenance:0,due:1,byCategory:[{category:'fleet',count:1}]},nextCursor:null};
  };
 });
 await page.goto('http://localhost/');await page.getByRole('button',{name:'Corporate assets',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>calls.length),0,'unrelated pages must not load asset records');
 await page.getByRole('button',{name:'Corporate assets',exact:true}).click();await page.getByText('TR-001',{exact:true}).waitFor();
 assert.equal(await page.locator('#corporateassets').evaluate(el=>el.classList.contains('active')),true);
 await page.locator('#corporateassets .asset-distribution .asset-bar').waitFor();
 mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/corporate-assets-desktop.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByLabel('Asset name',{exact:true}).fill('Office laptop');await page.getByLabel('Branch / location',{exact:true}).fill('Palapye');await page.getByLabel('Acquisition date',{exact:true}).fill('2026-10-01');await page.getByLabel('Acquisition cost (BWP)',{exact:true}).fill('15000.25');await page.getByLabel('Recorded book value (BWP)',{exact:true}).fill('14000');
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});assert.ok(await page.evaluate(()=>calls.some(c=>c.method==='POST')));
 // A generic 200 OK followed by a page without the new ID cannot prove a saved record exists.
 await page.getByText('Save accepted, but exact asset readback could not be verified. Refresh or search to confirm.').waitFor();
 // An ID outside the first register page must still be verified from authenticated exact GET.
 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByLabel('Asset name',{exact:true}).fill('Off-page printer');
 await page.getByLabel('Branch / location',{exact:true}).fill('Francistown');
 await page.getByLabel('Acquisition date',{exact:true}).fill('2026-11-01');
 await page.getByLabel('Acquisition cost (BWP)',{exact:true}).fill('2500');
 await page.getByLabel('Recorded book value (BWP)',{exact:true}).fill('2000');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Saved and verified in your company register.').waitFor();
 assert.ok(await page.evaluate(()=>calls.some(c=>/^\/api\/corporate-assets\/[a-f0-9-]{36}$/i.test(c.path))),'exact-ID readback must be used beyond first page');
 // Editing an existing ID confirms the positive readback path when the exact ID is present.
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Saved and verified in your company register.').waitFor();
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByText('corporate asset created',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();

 // Exact service history ID, not the parent asset ID, proves the accepted service save.
 await page.getByRole('button',{name:'Service / renewal',exact:true}).click();
 await page.getByLabel('Service / record date',{exact:true}).fill('2026-11-01');
 await page.getByLabel('Next due date',{exact:true}).fill('2026-12-15');
 await page.getByLabel('Description',{exact:true}).fill('Annual inspection');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Service / renewal saved and verified in asset history.').waitFor();
 // An acknowledged service with no matching sealed event is explicitly unverified.
 await page.evaluate(()=>{
  window.serviceReadbackApi=window.apiJson;
  window.apiJson=(path,opts={})=>{
   if(opts.method==='POST'&&path.endsWith('/services'))return Promise.resolve({ok:true,id:JSON.parse(opts.body).id});
   if(path.endsWith('/history'))return Promise.resolve({items:[]});
   return window.serviceReadbackApi(path,opts);
  };
 });
 await page.getByRole('button',{name:'Service / renewal',exact:true}).click();
 await page.getByLabel('Service / record date',{exact:true}).fill('2026-11-02');
 await page.getByLabel('Next due date',{exact:true}).fill('2027-01-15');
 await page.getByLabel('Description',{exact:true}).fill('Scheduled calibration');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Save accepted, but service history readback could not be verified. Open History or refresh to confirm.').waitFor();
 await page.evaluate(()=>{window.apiJson=window.serviceReadbackApi;});
 // An unchanged stale register row cannot verify an edit even when the server says ok.
 await page.evaluate(()=>{
  window.assetReadbackApi=window.apiJson;
  window.apiJson=(path,opts={})=>opts.method==='PUT'?Promise.resolve({ok:true,id:JSON.parse(opts.body).id}):window.assetReadbackApi(path,opts);
 });
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByLabel('Branch / location',{exact:true}).fill('Maun');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Save accepted, but exact asset readback could not be verified. Refresh or search to confirm.').waitFor();
 await page.evaluate(()=>{window.apiJson=window.assetReadbackApi;});
 console.log('PASS exact service audit readback, missing audit caution and stale edit detection');

 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile viewport must not overflow');
 await page.screenshot({path:'test-results/corporate-assets-mobile.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await page.getByLabel('Asset name',{exact:true}).inputValue(),'Delivery truck');await page.keyboard.press('Escape');
 await page.evaluate(()=>showView('peopleops'));assert.equal(await page.locator('#corporateassets .asset-list').innerText(),'','leaving the workspace clears private records');
 assert.deepEqual(errors,[]);console.log('PASS Assets native navigation, deferred loading, register form, history, mobile width and data clearing');
 await page.evaluate(()=>{currentUser={id:'reviewer',tenantId:'tenant-b',role:'reviewer'};showView('corporateassets')});assert.equal(await page.locator('#corporateassets .asset-list').innerText(),'');
 // Regression: failed asset-list API must never leave a silent inert Register asset button.
 await page.evaluate(()=>{
  showView('peopleops');
  currentUser={id:'owner-a',tenantId:'tenant-a',role:'owner'};
  window.savedAssetsApi=window.apiJson;
  window.apiJson=async()=>{throw Object.assign(new Error('assets_unavailable'),{code:'assets_unavailable'})};
  showView('corporateassets');
 });
 await page.getByText('Asset registration is unavailable in this workspace. No records can be saved.').waitFor();
 await page.getByRole('heading',{name:'Asset register unavailable'}).waitFor();
 assert.equal(await page.getByText('Register equipment, vehicles or furniture to start your company register.').count(),0,'failed backend must not be mistaken for an empty register');
 assert.equal(await page.getByRole('button',{name:'Register asset',exact:true}).getAttribute('aria-disabled'),'true');
 await page.getByRole('button',{name:'Retry loading assets'}).click();
 await page.getByRole('heading',{name:'Asset register unavailable'}).waitFor();

 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByText('Cannot register an asset yet: the asset service is still loading or unavailable. Use Refresh to retry. No asset has been saved.').waitFor();
 assert.equal(await page.locator('.corporate-asset-dialog').count(),0,'unqualified backend must not open a save form');
 // A maintenance-read failure after a successful register read must not block creation form navigation.
 await page.evaluate(()=>{
  window.apiJson=(path,opts)=>path.endsWith('/schedule')?Promise.reject(Error('schedule unavailable')):window.savedAssetsApi(path,opts);
 });
 await page.getByRole('button',{name:'Retry loading assets'}).click();
 await page.getByText('Maintenance schedule unavailable. Asset register remains available.').waitFor();
 assert.equal(await page.getByRole('button',{name:'Register asset',exact:true}).getAttribute('aria-disabled'),'false');
 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByRole('heading',{name:'Register asset',exact:true}).waitFor();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('.corporate-asset-dialog').waitFor({state:'detached'});
 assert.equal(await page.locator('.corporate-asset-dialog').count(),0);
 // A response without an explicit save acknowledgement must not be shown as a successful write.
 await page.evaluate(()=>{window.apiJson=(path,opts={})=>opts.method==='POST'?Promise.resolve({ok:false}):window.savedAssetsApi(path,opts)});
 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByLabel('Asset name',{exact:true}).fill('Office laptop');
 await page.getByLabel('Branch / location',{exact:true}).fill('Palapye');
 await page.getByLabel('Acquisition date',{exact:true}).fill('2026-10-01');
 await page.getByLabel('Acquisition cost (BWP)',{exact:true}).fill('15000');
 await page.getByLabel('Recorded book value (BWP)',{exact:true}).fill('14000');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('The server did not confirm this save. Refresh before trying again.').waitFor();
 assert.equal(await page.locator('.corporate-asset-dialog').count(),1,'unconfirmed save must keep form open');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('.corporate-asset-dialog').waitFor({state:'detached'});
 // An acknowledged save followed by a failed list refresh is not a verified readback.
 await page.evaluate(()=>{window.apiJson=(path,opts={})=>opts.method==='POST'?Promise.resolve({ok:true}):path.startsWith('/api/corporate-assets?')?Promise.reject(Object.assign(Error('assets_unavailable'),{code:'assets_unavailable'})):window.savedAssetsApi(path,opts)});
 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByLabel('Asset name',{exact:true}).fill('Company printer');
 await page.getByLabel('Branch / location',{exact:true}).fill('Gaborone');
 await page.getByLabel('Acquisition date',{exact:true}).fill('2026-10-01');
 await page.getByLabel('Acquisition cost (BWP)',{exact:true}).fill('1200');
 await page.getByLabel('Recorded book value (BWP)',{exact:true}).fill('1100');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.corporate-asset-dialog').waitFor({state:'detached'});
 await page.getByText('Save accepted, but the register could not be refreshed. Use Refresh to verify your record.').waitFor();
 await page.getByRole('button',{name:'Export view',exact:true}).click();
 await page.getByText('Export is unavailable until the asset register loads. Use Refresh to retry.').waitFor();

 // When list refresh fails after an acknowledged save, an exact-ID asset GET
 // must still establish persistence without making the register writable.
 await page.evaluate(()=>{
  window.apiJson=window.savedAssetsApi;
 });
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('TR-001',{exact:true}).waitFor();
 await page.evaluate(()=>{
  const base=window.apiJson;
  let saved=null,failList=false;
  window.apiJson=(path,opts={})=>{
   if(opts.method==='POST'&&path==='/api/corporate-assets'){
    const b=JSON.parse(opts.body);
    saved={id:b.id,name:b.name,category:b.category,branch:b.branch,
     serial:b.serial,custodian:b.custodian,acquisition_date:b.acquisitionDate,
     acquisition_cost_minor:b.acquisitionCostMinor,book_value_minor:b.bookValueMinor,
     status:b.status,revision:1};
    failList=true;
    return Promise.resolve({ok:true,id:b.id});
   }
   if(path.startsWith('/api/corporate-assets?')&&failList)
    return Promise.reject(Object.assign(Error('assets_unavailable'),{code:'assets_unavailable'}));
   if(/^\/api\/corporate-assets\/[a-f0-9-]{36}$/i.test(path))
    return Promise.resolve({item:saved?.id===path.split('/').at(-1)?saved:null});
   return base(path,opts);
  };
 });
 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByLabel('Asset name',{exact:true}).fill('Confirmed field generator');
 await page.getByLabel('Branch / location',{exact:true}).fill('Maun');
 await page.getByLabel('Acquisition date',{exact:true}).fill('2026-10-01');
 await page.getByLabel('Acquisition cost (BWP)',{exact:true}).fill('4500');
 await page.getByLabel('Recorded book value (BWP)',{exact:true}).fill('4000');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Save verified by exact record ID, but the asset register could not reload. Use Refresh before further changes.').waitFor();
 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByText('Cannot register an asset yet: the asset service is still loading or unavailable. Use Refresh to retry. No asset has been saved.').waitFor();
 assert.equal(await page.locator('.corporate-asset-dialog').count(),0);
 await page.evaluate(()=>{window.apiJson=window.savedAssetsApi});
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('TR-001',{exact:true}).waitFor();

 // The service audit-history readback must also be attempted if the list API
 // fails after an accepted service entry.
 await page.evaluate(()=>{
  const base=window.apiJson;
  let savedService=null,failList=false;
  window.apiJson=(path,opts={})=>{
   if(opts.method==='POST'&&path.endsWith('/services')){
    savedService=JSON.parse(opts.body);failList=true;
    return Promise.resolve({ok:true,id:savedService.id});
   }
   if(path.startsWith('/api/corporate-assets?')&&failList)
    return Promise.reject(Object.assign(Error('assets_unavailable'),{code:'assets_unavailable'}));
   if(path.endsWith('/history'))return Promise.resolve({items:savedService?[{
    event_type:'CORPORATE_ASSET_SERVICE_RECORDED',event_data:JSON.stringify(savedService),
    occurred_at:'2026-11-16T00:00:00Z'
   }]:[]});
   return base(path,opts);
  };
 });
 await page.getByRole('button',{name:'Service / renewal',exact:true}).click();
 await page.getByLabel('Service / record date',{exact:true}).fill('2026-11-01');
 await page.getByLabel('Next due date',{exact:true}).fill('2026-12-30');
 await page.getByLabel('Description',{exact:true}).fill('Synthetic annual inspection');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Save verified by exact record ID, but the asset register could not reload. Use Refresh before further changes.').waitFor();
 await page.evaluate(()=>{window.apiJson=window.savedAssetsApi});
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('TR-001',{exact:true}).waitFor();
 console.log('PASS exact asset and service readback when post-save register refresh fails');

 // A second save while a different dialog is awaiting server response must
 // show a useful message instead of doing nothing.
 await page.evaluate(()=>{
  window.deferredSaveResolve=null;
  window.apiJson=(path,opts={})=>{
   if(opts.method==='POST')return new Promise(resolve=>{window.deferredSaveResolve=resolve});
   return window.savedAssetsApi(path,opts);
  };
 });
 await page.getByRole('button',{name:'Register asset',exact:true}).click();
 await page.getByLabel('Asset name',{exact:true}).fill('Waiting generator');
 await page.getByLabel('Branch / location',{exact:true}).fill('Gaborone');
 await page.getByLabel('Acquisition date',{exact:true}).fill('2026-11-01');
 await page.getByLabel('Acquisition cost (BWP)',{exact:true}).fill('1000');
 await page.getByLabel('Recorded book value (BWP)',{exact:true}).fill('900');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Saving…').waitFor();
 // Force a second pending dialog via its existing registered click handler:
 // the first modal makes background toolbar controls intentionally inert to users.
 await page.evaluate(()=>{
  document.querySelector('#corporateassets [data-asset-write]')
   .dispatchEvent(new MouseEvent('click',{bubbles:true}));
 });
 const dialogs=page.locator('dialog.corporate-asset-dialog');
 assert.equal(await dialogs.count(),2);
 const second=dialogs.nth(1);
 await second.locator('[name="name"]').fill('Second generator');
 await second.locator('[name="branch"]').fill('Palapye');
 await second.locator('[name="acquisitionDate"]').fill('2026-11-01');
 await second.locator('[name="cost"]').fill('1000');
 await second.locator('[name="book"]').fill('900');
 await second.getByRole('button',{name:'Save',exact:true}).click();
 await second.getByText('Another asset save is still being verified. Try again when it finishes.').waitFor();
 await page.evaluate(()=>{window.deferredSaveResolve?.({ok:false})});
 await dialogs.first().getByText('The server did not confirm this save. Refresh before trying again.').waitFor();
 await page.evaluate(()=>{document.querySelectorAll('dialog.corporate-asset-dialog').forEach(d=>d.close())});
 await page.evaluate(()=>{window.apiJson=window.savedAssetsApi});

 // Malformed list payload fails closed without making the register writable.
 await page.evaluate(()=>{window.apiJson=async()=>({items:null,summary:{},nextCursor:null})});
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('Could not load asset registration. Use Refresh to retry; no records can be saved.').waitFor();
 await page.evaluate(()=>{window.apiJson=window.savedAssetsApi});
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('TR-001',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS Asset API unavailable click feedback and independent schedule failure handling');
}finally{await browser.close()}
