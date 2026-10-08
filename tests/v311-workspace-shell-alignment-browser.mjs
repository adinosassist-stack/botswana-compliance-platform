import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=fs.readFileSync('public/index.html','utf8');
const ids=['workhub','businesshub','evidencehub','tenderhub','automationhub','sites','servicesmarketplace'];
const sections=ids.map(id=>html.match(new RegExp('<section id="'+id+'"[\\s\\S]*?</section>'))[0]).join('');
const inline=[...html.slice(0,html.indexOf('</head>')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match=>match[1]).join('\n');
const baseAssets=['workspace-command-center-v230.css','workspace-command-center-v231.css','workspace-reference-shell-v237.css','workspace-infographics-v309.css'];
const styles=inline+'\n'+baseAssets.map(file=>fs.readFileSync('public/assets/'+file,'utf8')).join('\n');
const alignment=fs.readFileSync('public/assets/workspace-shell-alignment-v311.css','utf8');
const sha='b'.repeat(40),base='<html><head></head><body></body></html>';
assert(!versionReleaseAssets(base,sha).includes('workspace-shell-alignment-v311.css'));
const decorated=versionReleaseAssets(base,sha,{includeWorkspaceFixes:true});
assert(decorated.includes('workspace-shell-alignment-v311.css?release='+sha));
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated);

const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(file=>fs.existsSync(file)),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  for(const width of [320,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(`<style>${styles}*{animation:none!important;transition:none!important}</style><main id="mainContent" style="margin:0;padding:16px">${sections}<section id="propertyintelligence" class="view active property-compact-v260"><div id="calculator" class="property-calculator-v224" style="width:280px;height:160px">Calculator</div></section></main>`);
    await page.addScriptTag({path:'public/js/workspace-infographics-v309.js'});
    const calculatorBefore=await page.locator('#calculator').evaluate(el=>el.getBoundingClientRect().toJSON());
    await page.addStyleTag({content:alignment});
    const calculatorAfter=await page.locator('#calculator').evaluate(el=>el.getBoundingClientRect().toJSON());
    assert.deepEqual(calculatorAfter,calculatorBefore,`V311 must not move Property calculator ${width}`);

    for(const id of ids){
      await page.evaluate(id=>{document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===id));window.dispatchEvent(new CustomEvent('thebe:workspace-view-change',{detail:{id}}));},id);
      await page.waitForFunction(id=>document.getElementById(id).classList.contains('workspace-infographic-v309'),id);
      const geometry=await page.locator('#'+id).evaluate(root=>{
        const firstIconCard=root.querySelector('.workspace-info-icon-v309')?.parentElement||null;
        const summary=root.querySelector('.workspace-info-grid-v309,.proof-summary-grid,.market-v257-stats')||firstIconCard?.parentElement||null;
        if(!summary)return null;
        const parent=summary.parentElement;
        const parentRect=parent.getBoundingClientRect();
        const parentStyle=getComputedStyle(parent);
        const summaryRect=summary.getBoundingClientRect();
        const px=value=>Number.parseFloat(value)||0;
        const expected={x:parentRect.x+px(parentStyle.paddingLeft),right:parentRect.right-px(parentStyle.paddingRight)};
        const peers=[...parent.children].filter(el=>el!==summary&&el.matches?.('.workspace-info-grid-v309,.outcome-grid,.business-outcome-grid,.proof-summary-grid,.money-v307-status-grid,.protect-v308-status-grid,.market-v257-stats')&&getComputedStyle(el).display!=='none').map(el=>{const rect=el.getBoundingClientRect();return{x:rect.x,right:rect.right,className:el.className}});
        return{summary:{x:summaryRect.x,right:summaryRect.right,className:summary.className},expected,peers,overflow:root.scrollWidth>root.clientWidth};
      });
      assert(geometry,`V311 visual summary exists ${id} ${width}`);
      assert.equal(geometry.overflow,false,`V311 no workspace overflow ${id} ${width}`);
      assert(Math.abs(geometry.summary.x-geometry.expected.x)<1,`V311 ${id} left edge fills parent content ${width}; ${geometry.summary.className}`);
      assert(Math.abs(geometry.summary.right-geometry.expected.right)<1,`V311 ${id} right edge fills parent content ${width}; ${geometry.summary.className}`);
      assert(geometry.peers.every(peer=>Math.abs(peer.x-geometry.summary.x)<1&&Math.abs(peer.right-geometry.summary.right)<1),`V311 ${id} sibling shell edges align ${width}; ${JSON.stringify(geometry.peers)}`);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`V311 no document overflow ${width}`);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS V311: seven workspace visual-summary shells fill parent content at 320-1280px, aligned sibling grids stay flush, no overflow, release delivery is app-scoped and Property calculator geometry is unchanged');
}finally{
  await browser.close();
}
