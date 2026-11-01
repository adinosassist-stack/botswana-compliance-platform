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
  const item={id:'11111111-1111-4111-8111-111111111111',name:'Delivery truck',category:'fleet',branch:'Gaborone',serial:'TR-001',custodian:'Dispatch',acquisition_date:'2026-01-01',acquisition_cost_minor:20000000,book_value_minor:19000000,status:'active',revision:1};
  window.apiJson=async(path,opts={})=>{window.calls.push({path,method:opts.method||'GET'});if(opts.method==='POST'||opts.method==='PUT')return {ok:true};if(path.endsWith('/history'))return {items:[{event_type:'CORPORATE_ASSET_CREATED',occurred_at:'2026-11-01T00:00:00Z'}]};if(path.endsWith('/schedule'))return {items:[{asset_name:item.name,kind:'insurance',due_on:'2026-12-01'}]};return {items:[item],summary:{total:1,bookValueMinor:19000000,maintenance:0,due:1,byCategory:[{category:'fleet',count:1}]},nextCursor:null}};
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
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByText('corporate asset created',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile viewport must not overflow');
 await page.screenshot({path:'test-results/corporate-assets-mobile.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await page.getByLabel('Asset name',{exact:true}).inputValue(),'Delivery truck');await page.keyboard.press('Escape');
 await page.evaluate(()=>showView('peopleops'));assert.equal(await page.locator('#corporateassets .asset-list').innerText(),'','leaving the workspace clears private records');
 assert.deepEqual(errors,[]);console.log('PASS Assets native navigation, deferred loading, register form, history, mobile width and data clearing');
 await page.evaluate(()=>{currentUser={id:'reviewer',tenantId:'tenant-b',role:'reviewer'};showView('corporateassets')});assert.equal(await page.locator('#corporateassets .asset-list').innerText(),'');
}finally{await browser.close()}
