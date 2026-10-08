import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const baseCss=fs.readFileSync('public/assets/workspace-infographics-v309.css','utf8');
const css=fs.readFileSync('public/assets/workspace-mobile-readability-v314.css','utf8');
const ids=['workhub','businesshub','evidencehub','tenderhub','automationhub','moneyhub','protecthub','sites','servicesmarketplace'];

for(const id of ids)assert(css.includes(`#${id}`),`V314 must explicitly scope ${id}`);
assert.doesNotMatch(css,/#propertyintelligence|\.property-|thebe-ai-dock/i,'V314 must not target Property or dock geometry');
assert.match(css,/@media\(max-width:620px\)/,'V314 phone breakpoint must match People');
assert.match(css,/grid-template-columns:1fr!important/,'V314 must stack generic infographic cards to one column on phones');

const sha='d'.repeat(40),base='<html><head></head><body></body></html>';
assert(!versionReleaseAssets(base,sha).includes('workspace-mobile-readability-v314.css'),'V314 must not ship outside the authenticated app');
const decorated=versionReleaseAssets(base,sha,{includeWorkspaceFixes:true});
assert(decorated.includes('workspace-mobile-readability-v314.css?release='+sha),'V314 must be release-bound in the app');
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated,'V314 release injection must be idempotent');
const injector=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
assert(injector.indexOf('/assets/workspace-mobile-readability-v314.css')>injector.indexOf('/assets/workspace-container-alignment-v313.css'),'V314 must load after V313');

const icon='<svg class="workspace-info-icon-v309" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg>';
const card=(value,label,width)=>`<div class="workspace-info-card-v309">${icon}<b>${value}</b><span class="workspace-info-label-v309">${label}</span><span class="workspace-info-bar-v309"><span style="width:${width}%"></span></span></div>`;
const sections=ids.map(id=>`<section id="${id}" class="view workspace-infographic-v309"><div class="workspace-info-grid-v309">${card('12','Needs action',100)}${card('7','Waiting review',58)}${card('3','Completed today',25)}</div><p class="workspace-info-scale-v309">Count bars share a scale.</p></section>`).join('');

const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(file=>fs.existsSync(file)),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  for(const width of [320,390,620,768,1280]){
    const page=await browser.newPage({viewport:{width,height:1000}});
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0}.view{padding:0 14px;margin:0 0 16px}.property-calculator-v224{width:280px;height:160px}.thebe-ai-dock{position:fixed;right:10px;bottom:10px;width:260px;height:420px}</style><style>${baseCss}</style><main id="mainContent">${sections}<section id="propertyintelligence"><div id="calculator" class="property-calculator-v224">Calculator</div></section></main><aside id="thebeAiDock" class="thebe-ai-dock"></aside>`);
    const protectedBefore=await page.evaluate(()=>({calculator:document.getElementById('calculator').getBoundingClientRect().toJSON(),dock:document.getElementById('thebeAiDock').getBoundingClientRect().toJSON()}));
    await page.addStyleTag({content:css});
    const protectedAfter=await page.evaluate(()=>({calculator:document.getElementById('calculator').getBoundingClientRect().toJSON(),dock:document.getElementById('thebeAiDock').getBoundingClientRect().toJSON()}));
    assert.deepEqual(protectedAfter,protectedBefore,`V314 must not move Property calculator or dock ${width}`);

    for(const id of ids){
      const geometry=await page.locator('#'+id).evaluate(root=>{
        const grid=root.querySelector('.workspace-info-grid-v309');
        const cards=[...grid.children].map(card=>{const rect=card.getBoundingClientRect();const style=getComputedStyle(card);return{x:rect.x,width:rect.width,height:rect.height,display:style.display,columns:style.gridTemplateColumns,minHeight:style.minHeight}});
        const gridRect=grid.getBoundingClientRect();
        return{cards,grid:{x:gridRect.x,width:gridRect.width,columns:getComputedStyle(grid).gridTemplateColumns},overflow:root.scrollWidth>root.clientWidth};
      });
      assert.equal(geometry.overflow,false,`V314 no horizontal overflow ${id} ${width}`);
      if(width<=620){
        assert.equal(new Set(geometry.cards.map(card=>Math.round(card.x))).size,1,`V314 ${id} must stack cards at ${width}`);
        for(const item of geometry.cards){
          assert(Math.abs(item.width-geometry.grid.width)<1,`V314 ${id} card must fill grid width at ${width}`);
          assert.equal(item.display,'grid',`V314 ${id} card uses compact grid at ${width}`);
          assert(item.height>=82,`V314 ${id} card keeps readable minimum height at ${width}`);
        }
      }else{
        assert(new Set(geometry.cards.map(card=>Math.round(card.x))).size>=2,`V314 ${id} should keep multi-column desktop/tablet layout at ${width}`);
      }
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`V314 no document overflow ${width}`);
    await page.close();
  }
  console.log('PASS V314: generic workspace infographic cards stack into compact People-like rows on phones while tablet/desktop remain multi-column; Property calculator and dock geometry remain unchanged');
}finally{
  await browser.close();
}
