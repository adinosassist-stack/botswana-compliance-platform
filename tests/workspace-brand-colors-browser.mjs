import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {injectOwnerCommandCentreAssets,externalizeWorkspaceHeadStyles} from '../cloudflare/src/production-entry.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const components=fs.readFileSync('public/js/components.js','utf8');
const interactionHref=components.match(/link\.href="([^\"]*workspace-interactions-v318\.css[^\"]*)"/)?.[1];
assert.ok(interactionHref,'load the actual interaction stylesheet selected by the component bootstrap');
let html=fs.readFileSync('public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi,'');
html=injectOwnerCommandCentreAssets(externalizeWorkspaceHeadStyles(html)).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
// Production base/module styles first, then the runtime-installed layers last.
html=html.replace('</head>',`<link rel="stylesheet" href="/assets/workspace-visual-consistency-v319.css"><link rel="stylesheet" href="${interactionHref}"><style>@media(prefers-reduced-motion:reduce){*{transition:none!important}} #brandFixture{display:block!important;position:fixed;inset:0;z-index:999999;background:white;padding:24px}#appShell{display:block!important;visibility:visible!important}</style></head>`);
const fixture=`<section id="brandFixture"><button class="btn" id="brandPrimary">Add evidence</button><button class="btn soft" id="brandSoft">Save scenario</button><button class="btn alt" id="brandAlt">Cancel</button><button class="btn danger" id="brandDanger">Delete</button><button class="btn" disabled id="brandDisabled">Disabled</button><button class="btn" aria-busy="true" id="brandBusy">Saving</button><span class="hub-icon" id="brandIcon">P</span><div class="commandmodes"><button class="active" id="brandMode">People</button></div><span class="badge good" id="brandSuccess">Complete</span></section>`;
// Reuse the real workspace root so scoped rules and production specificity apply.
html=html.replace(/(<[^>]+id="appShell"[^>]*>)/,`$1${fixture}`);
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://workspace.test')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(/^\/assets\/[a-z0-9-]+\.css$/.test(url.pathname)&&fs.existsSync('public'+url.pathname))return route.fulfill({contentType:'text/css',body:fs.readFileSync('public'+url.pathname,'utf8')});
   return route.abort();
  });
  await page.goto('http://workspace.test/',{waitUntil:'networkidle'});
  const style=(id,prop)=>page.locator('#'+id).evaluate((el,p)=>getComputedStyle(el)[p],prop);
  assert.equal(await style('brandPrimary','backgroundColor'),'rgb(11, 102, 214)',`primary blue at ${width}`);
  assert.equal(await style('brandPrimary','borderTopColor'),'rgb(11, 102, 214)',`primary border blue at ${width}`);
  assert.equal(await style('brandSoft','color'),'rgb(11, 102, 214)',`soft control blue at ${width}`);
  assert.equal(await style('brandSoft','backgroundColor'),'rgb(237, 245, 255)',`soft control pale blue at ${width}`);
  assert.equal(await style('brandIcon','color'),'rgb(11, 102, 214)',`decorative hub icon blue at ${width}`);
  assert.equal(await style('brandMode','color'),'rgb(11, 102, 214)',`selected command mode blue at ${width}`);
  await page.locator('#brandPrimary').hover();
  assert.equal(await style('brandPrimary','backgroundColor'),'rgb(9, 85, 183)',`primary hover stays blue at ${width}`);
  await page.locator('#brandAlt').hover();
  assert.equal(await style('brandAlt','color'),'rgb(9, 85, 183)',`secondary hover blue at ${width}`);
  await page.locator('#brandSoft').hover();
  assert.equal(await style('brandSoft','backgroundColor'),'rgb(226, 239, 255)',`soft hover pale blue at ${width}`);
  await page.locator('#brandSoft').focus();
  await page.keyboard.press('Tab');
  const focused=await page.locator('#brandAlt').evaluate(el=>el===document.activeElement);
  assert.equal(focused,true,'keyboard reaches the secondary action after the soft action');
  assert.equal(await style('brandAlt','outlineColor'),'rgb(11, 102, 214)',`keyboard focus blue at ${width}`);
  assert.equal(await style('brandDanger','backgroundColor'),'rgb(143, 29, 22)','explicit destructive action retains its distinct semantic color');
  assert.equal(await style('brandSuccess','color'),'rgb(36, 105, 79)','success retains its semantic green');
  assert.equal(await style('brandDisabled','cursor'),'not-allowed','disabled state remains distinguishable');
  assert.equal(await style('brandBusy','cursor'),'progress','loading state remains distinguishable');
  await page.close();
 }
 console.log('PASS workspace brand colors: actual production CSS cascade, default/hover/focus, semantic states, 390px and 1280px');
}finally{await browser.close()}
