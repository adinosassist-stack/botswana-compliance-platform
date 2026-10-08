import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const css=fs.readFileSync('public/assets/workspace-container-alignment-v313.css','utf8');
const ids=['workhub','businesshub','evidencehub','tenderhub','automationhub','moneyhub','protecthub','sites','servicesmarketplace'];
for(const id of ids)assert(css.includes(`#${id}`),`V313 must explicitly scope ${id}`);
assert.doesNotMatch(css,/#propertyintelligence|\.property-|thebe-ai-dock/i,'V313 must not target Property or dock geometry');

const sha='c'.repeat(40),base='<html><head></head><body></body></html>';
assert(!versionReleaseAssets(base,sha).includes('workspace-container-alignment-v313.css'),'V313 must not ship outside the authenticated app');
const decorated=versionReleaseAssets(base,sha,{includeWorkspaceFixes:true});
assert(decorated.includes('workspace-container-alignment-v313.css?release='+sha),'V313 must be release-bound in the app');
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated,'V313 release injection must be idempotent');
const injector=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
assert(injector.indexOf('/assets/workspace-container-alignment-v313.css')>injector.indexOf('/assets/property-solid-surfaces-v312.css'),'V313 must load after V312');

const fixtures={
  workhub:'<div class="hub-hero">Work</div><div class="outcome-status-strip">Summary</div><div class="outcome-grid">Work grid</div>',
  businesshub:'<div class="hub-hero">Business</div><div class="business-status-strip">Summary</div><div class="business-outcome-grid">Business grid</div>',
  evidencehub:'<div class="hub-hero">Evidence</div><div class="proof-summary-grid">Summary</div><div class="proof-work-grid">Proof grid</div>',
  tenderhub:'<div class="hub-hero">Tender</div><div class="workspace-info-grid-v309">Summary</div>',
  automationhub:'<div class="hub-hero">Automation</div><div class="workspace-info-grid-v309">Summary</div>',
  moneyhub:'<div class="hub-hero">Money</div><section class="money-v307-shell">Money workspace</section>',
  protecthub:'<div class="hub-hero">Protect</div><section class="protect-v308-shell">Protect workspace</section>',
  sites:'<div class="hub-hero">Sites</div><div class="workspace-info-grid-v309">Summary</div>',
  servicesmarketplace:'<div class="hub-hero">Market</div><div class="market-v257-stats">Summary</div>'
};
const sections=ids.map(id=>`<section id="${id}" class="view workspace-infographic-v309">${fixtures[id]}</section>`).join('');
const targetSelector=':scope > :is(.hub-hero,.outcome-status-strip,.outcome-grid,.business-status-strip,.business-outcome-grid,.proof-summary-grid,.proof-work-grid,.money-v307-shell,.protect-v308-shell,.market-v257-stats,.workspace-info-grid-v309,.workspace-info-scale-v309)';
const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(file=>fs.existsSync(file)),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  for(const width of [320,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}.view{margin:0 0 12px;padding:0 13px}.workspace-infographic-v309>${targetSelector.replace(':scope > ','')}{width:calc(100% - 36px);margin-left:22px;margin-right:14px}.property-calculator-v224{width:280px;height:160px}.thebe-ai-dock{position:fixed;right:10px;bottom:10px;width:260px;height:420px}</style><main id="mainContent" style="padding:16px">${sections}<section id="propertyintelligence"><div id="calculator" class="property-calculator-v224">Calculator</div></section></main><aside id="thebeAiDock" class="thebe-ai-dock"></aside>`);
    const protectedBefore=await page.evaluate(()=>({calculator:document.getElementById('calculator').getBoundingClientRect().toJSON(),dock:document.getElementById('thebeAiDock').getBoundingClientRect().toJSON()}));
    await page.addStyleTag({content:css});
    const protectedAfter=await page.evaluate(()=>({calculator:document.getElementById('calculator').getBoundingClientRect().toJSON(),dock:document.getElementById('thebeAiDock').getBoundingClientRect().toJSON()}));
    assert.deepEqual(protectedAfter,protectedBefore,`V313 must not move Property calculator or dock ${width}`);

    for(const id of ids){
      const geometry=await page.locator('#'+id).evaluate((root,targetSelector)=>{
        const rootRect=root.getBoundingClientRect();
        const style=getComputedStyle(root);
        const px=value=>Number.parseFloat(value)||0;
        const expected={left:rootRect.left+px(style.paddingLeft),right:rootRect.right-px(style.paddingRight)};
        const targets=[...root.querySelectorAll(targetSelector)].filter(el=>getComputedStyle(el).display!=='none').map(el=>{const rect=el.getBoundingClientRect();return{left:rect.left,right:rect.right,className:el.className}});
        return{expected,targets,overflow:root.scrollWidth>root.clientWidth};
      },targetSelector);
      assert(geometry.targets.length>=2||['tenderhub','automationhub','sites'].includes(id),`V313 expected stable top-level shell targets for ${id}`);
      assert.equal(geometry.overflow,false,`V313 no horizontal overflow ${id} ${width}`);
      for(const target of geometry.targets){
        assert(Math.abs(target.left-geometry.expected.left)<1,`V313 ${id} left edge ${target.className} ${width}`);
        assert(Math.abs(target.right-geometry.expected.right)<1,`V313 ${id} right edge ${target.className} ${width}`);
      }
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`V313 no document overflow ${width}`);
    await page.close();
  }
  console.log('PASS V313: nine V309 workspace top-level containers share parent content edges at 320-1280px; Property calculator and dock geometry remain unchanged');
}finally{
  await browser.close();
}
