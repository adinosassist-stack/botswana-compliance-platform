import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {injectOwnerCommandCentreAssets,externalizeWorkspaceHeadStyles} from '../cloudflare/src/production-entry.js';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=fs.readFileSync('public/index.html','utf8');
const propertyStart=html.indexOf('  <section id="propertyintelligence"');
const property=html.slice(propertyStart,html.indexOf('</section>',propertyStart)+10).replace('class="view simplified-hub','class="view active simplified-hub');
let fixture=externalizeWorkspaceHeadStyles('<!doctype html>'+html.slice(html.indexOf('<html'),html.indexOf('</head>')+7)+'<body><section id="marketingGate" class="hidden" style="display:none"></section><section id="appShell" class="shell"><aside id="workspaceSidebar"><button>Home</button></aside><main id="mainContent"><div class="top"><h1 id="pageTitle">Property</h1></div>'+property+'</main></section></body></html>');
fixture=injectOwnerCommandCentreAssets(fixture);
fixture=versionReleaseAssets(fixture,'9'.repeat(40));

const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p)),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
    if(pathname==='/assets/thebe-ai-dock.css'||pathname==='/assets/thebe-spatial-dock-v246.css')return route.fulfill({contentType:'text/css',body:''});
    if(pathname.endsWith('.js')&&!pathname.includes('thebe-live-voice')&&!pathname.includes('property-visibility')&&!pathname.includes('thebe-dock-recovery-geometry-v269'))return route.fulfill({contentType:'application/javascript',body:''});
    const file='public'+pathname;
    return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await page.addInitScript(()=>{window.currentWorkspaceRole=()=> 'owner';window.apiJson=async()=>({sessionCreationAllowed:false})});
  await page.goto('http://localhost/');
  await page.waitForSelector('#thebeAiDock');
  await page.waitForFunction(()=>{const d=document.getElementById('thebeAiDock');return d?.dataset.cssRecovery==='1'&&d?.dataset.geometryRecovery==='20261003-emergency-dock-geometry-v269'});

  const assertGeometry=async(expectedWidth,label)=>{
    await page.waitForFunction(expected=>Math.abs(document.getElementById('thebeAiDock').getBoundingClientRect().width-expected)<=1,expectedWidth);
    const geometry=await page.evaluate(()=>{
      const dock=document.getElementById('thebeAiDock'),d=dock.getBoundingClientRect(),m=document.getElementById('mainContent').getBoundingClientRect(),orb=dock.querySelector('.thebe-ai-orb-button')?.getBoundingClientRect();
      return {dock:{left:d.left,right:d.right,top:d.top,width:d.width,height:d.height},main:{left:m.left,right:m.right,width:m.width},orb:{width:orb?.width||0,height:orb?.height||0},recovery:dock.dataset.cssRecovery,guard:dock.dataset.geometryRecovery};
    });
    assert(Math.abs(geometry.dock.width-expectedWidth)<=1,`${label} emergency width: ${JSON.stringify(geometry)}`);
    assert(Math.abs(geometry.orb.width-68)<=1&&Math.abs(geometry.orb.height-68)<=1,`${label} emergency voice remains 68px: ${JSON.stringify(geometry)}`);
    assert(geometry.main.right<=geometry.dock.left,`${label} emergency dock must not cover workspace: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.recovery,'1');
    assert.equal(geometry.guard,'20261003-emergency-dock-geometry-v269');
  };

  for(const [viewport,expected] of [[1440,272],[1200,272],[1199,256],[1024,256]]){
    await page.setViewportSize({width:viewport,height:960});
    await assertGeometry(expected,`normal ${viewport}`);
  }

  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Expand Thebe panel',exact:true}).click();
  for(const [viewport,expected] of [[1440,344],[1200,344],[1199,324],[1024,324]]){
    await page.setViewportSize({width:viewport,height:960});
    await assertGeometry(expected,`expanded ${viewport}`);
  }

  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{
    const d=document.getElementById('thebeAiDock')?.getBoundingClientRect();
    return d&&Math.abs(d.left-8)<=1&&Math.abs(d.right-(innerWidth-8))<=1;
  });
  const mobile=await page.evaluate(()=>{const d=document.getElementById('thebeAiDock').getBoundingClientRect();return {left:d.left,right:d.right,width:d.width,viewport:innerWidth}});
  assert(Math.abs(mobile.left-8)<=1&&Math.abs(mobile.right-(mobile.viewport-8))<=1,`mobile emergency dock keeps 8px gutters: ${JSON.stringify(mobile)}`);
  assert.deepEqual(errors,[],'forced CSS recovery must not throw browser errors');
  console.log('V269_EMERGENCY_DOCK_BROWSER_PASS: forced stylesheet failure preserves current compact dock, reserved workspace lane, 68px voice and mobile gutters');
}finally{await browser.close()}
