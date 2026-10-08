import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const baseCss=fs.readFileSync('public/assets/workspace-command-center-v231.css','utf8');
const css=fs.readFileSync('public/assets/workspace-mobile-header-targets-v315.css','utf8');

for(const id of ['workhub','accounthub'])assert(css.includes(`#${id}`),`V315 must explicitly scope ${id}`);
assert.doesNotMatch(css,/#tenderhub|#propertyintelligence|\.property-|thebe-ai-dock/i,'V315 must not target unrelated hubs, Property or dock geometry');
assert.match(css,/@media\(max-width:620px\)/,'V315 phone breakpoint must match the workspace mobile system');
assert.match(css,/min-height:44px!important/,'V315 mobile header actions must provide a 44px minimum touch target');

const sha='e'.repeat(40),base='<html><head></head><body></body></html>';
assert(!versionReleaseAssets(base,sha).includes('workspace-mobile-header-targets-v315.css'),'V315 must not ship outside the authenticated app');
const decorated=versionReleaseAssets(base,sha,{includeWorkspaceFixes:true});
assert(decorated.includes('workspace-mobile-header-targets-v315.css?release='+sha),'V315 must be release-bound in the app');
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated,'V315 release injection must be idempotent');
const injector=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
assert(injector.indexOf('/assets/workspace-mobile-header-targets-v315.css')>injector.indexOf('/assets/workspace-mobile-readability-v314.css'),'V315 must load after V314');

const hub=id=>`<section id="${id}" class="simplified-hub"><div class="hub-hero"><div><h2>${id}</h2></div><button type="button" class="btn alt">Header action</button></div></section>`;
const html=`<!doctype html><style>*{box-sizing:border-box}body{margin:0}.simplified-hub{padding:12px}.hub-hero{display:flex;justify-content:space-between}.property-calculator-v224{width:280px;height:160px}.thebe-ai-dock{position:fixed;right:10px;bottom:10px;width:260px;height:420px}</style><style>${baseCss}</style><main id="mainContent">${hub('workhub')}${hub('accounthub')}${hub('tenderhub')}<section id="propertyintelligence"><div id="calculator" class="property-calculator-v224">Calculator</div></section></main><aside id="thebeAiDock" class="thebe-ai-dock"></aside>`;

const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(file=>fs.existsSync(file)),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  for(const width of [320,390,620,768,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.setContent(html);
    const snapshot=()=>page.evaluate(()=>{
      const rect=id=>document.querySelector(`#${id} .hub-hero>.btn`).getBoundingClientRect();
      const geometry=id=>{const value=rect(id);return{x:value.x,width:value.width,height:value.height};};
      const calculatorRect=document.getElementById('calculator').getBoundingClientRect();
      const dockRect=document.getElementById('thebeAiDock').getBoundingClientRect();
      return{
        work:rect('workhub').toJSON(),settings:rect('accounthub').toJSON(),tender:geometry('tenderhub'),
        calculator:{x:calculatorRect.x,width:calculatorRect.width,height:calculatorRect.height},dock:dockRect.toJSON(),
        overflow:document.documentElement.scrollWidth>innerWidth
      };
    });
    const before=await snapshot();
    await page.addStyleTag({content:css});
    const after=await snapshot();
    assert.equal(after.overflow,false,`V315 must not create document overflow at ${width}`);
    assert.deepEqual(after.calculator,before.calculator,`V315 must not alter Property calculator horizontal/size geometry at ${width}`);
    assert.deepEqual(after.dock,before.dock,`V315 must not alter dock geometry at ${width}`);
    assert.deepEqual(after.tender,before.tender,`V315 must not alter unrelated hub header action horizontal/size geometry at ${width}`);
    if(width<=620){
      assert(before.work.height<44,`V315 fixture must reproduce the sub-44px Work target at ${width}`);
      assert(before.settings.height<44,`V315 fixture must reproduce the sub-44px Settings target at ${width}`);
      assert(after.work.height>=44,`V315 Work header action must be at least 44px at ${width}`);
      assert(after.settings.height>=44,`V315 Settings header action must be at least 44px at ${width}`);
      assert(after.work.width>=44,`V315 Work header action must keep a 44px minimum inline target at ${width}`);
      assert(after.settings.width>=44,`V315 Settings header action must keep a 44px minimum inline target at ${width}`);
    }else{
      assert.deepEqual(after.work,before.work,`V315 must leave Work desktop/tablet geometry unchanged at ${width}`);
      assert.deepEqual(after.settings,before.settings,`V315 must leave Settings desktop/tablet geometry unchanged at ${width}`);
    }
    await page.close();
  }
  console.log('PASS V315: Work and Settings mobile header actions reach 44px while unrelated hubs, desktop/tablet, Property horizontal/size geometry and dock geometry remain unchanged');
}finally{
  await browser.close();
}
