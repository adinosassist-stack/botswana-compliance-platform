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
const inline=[...html.slice(0,html.indexOf('</head>')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n');
const assets=['workspace-command-center-v230.css','workspace-command-center-v231.css','workspace-reference-shell-v237.css','property-calculator-compact-v223.css','property-calculator-reference-v224.css','property-visibility-v230.css','property-operations-v262.css','property-optimise-v263.css','property-compare-v264.css'];
const styles=inline+'\n'+assets.map(f=>fs.readFileSync('public/assets/'+f,'utf8')).join('\n');
const newStyles=fs.readFileSync('public/assets/workspace-infographics-v309.css','utf8');
const sha='a'.repeat(40),base='<html><head></head><body></body></html>';
assert(!versionReleaseAssets(base,sha).includes('workspace-infographics-v309'));
const decorated=versionReleaseAssets(base,sha,{includeWorkspaceFixes:true});
assert(decorated.includes('workspace-infographics-v309.css?release='+sha));
assert(decorated.includes('workspace-infographics-v309.js?release='+sha));
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated);
const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p)),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
 for(const width of [320,390,768,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<style>${styles}*{animation:none!important;transition:none!important}</style><div id="appShell"><main id="mainContent" style="margin:0;padding:16px">${sections}<section id="propertyintelligence" class="view active property-compact-v260"><div class="property-calculator-v224" id="calculator" style="width:280px;height:160px">Calculator</div><div class="property-hero-compact"><h2>Property</h2></div><div class="property-overview-v261"><h3 class="property-overview-title-v261">A very long property title that should remain readable on a small phone</h3></div><div class="property-operations-v262">Operations</div><div class="property-optimise-v263">Optimise</div><div class="property-compare-v264">Compare</div><div class="property-ops-ring-v262"><strong>67%</strong></div></section></main></div>`);
  const before=await page.locator('#calculator').evaluate(el=>el.getBoundingClientRect().toJSON());
  await page.addStyleTag({content:newStyles});
  await page.addScriptTag({path:'public/js/workspace-infographics-v309.js'});
  assert.equal(await page.locator('.workspace-info-ring-v309 .value').getAttribute('stroke-dasharray'),'67 100','Property readiness uses a true SVG arc, without a gradient');
  const after=await page.locator('#calculator').evaluate(el=>el.getBoundingClientRect().toJSON());assert.deepEqual(after,before,`calculator geometry ${width}`);
  for(const selector of ['.property-hero-compact','.property-overview-v261','.property-calculator-v224','.property-ops-ring-v262'])assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).backgroundImage),'none',`solid Property ${selector}`);
  const edges=await page.locator('.property-overview-v261,.property-operations-v262,.property-optimise-v263,.property-compare-v264').evaluateAll(els=>els.map(el=>({x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right})));
  assert(edges.every(e=>Math.abs(e.x-edges[0].x)<1&&Math.abs(e.right-edges[0].right)<1),`Property section edges align ${width}`);
  for(const id of ids){
   await page.evaluate(id=>{document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));window.dispatchEvent(new CustomEvent('thebe:workspace-view-change',{detail:{id}}))},id);
   await page.waitForFunction(id=>document.getElementById(id).classList.contains('workspace-infographic-v309'),id);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no overflow ${id} ${width}`);
   assert(await page.locator('#'+id+' .workspace-info-icon-v309').count()>0,`visual summary ${id}`);
   if(width<=620&&!['evidencehub','sites','servicesmarketplace'].includes(id))assert.equal(await page.locator('#'+id+' .workspace-info-grid-v309').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length),width<=360?1:2);
  }
  await page.evaluate(()=>{document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='workhub'));document.getElementById('workOpenActions').textContent='8';document.getElementById('workWaitingReviews').textContent='2';window.dispatchEvent(new Event('thebe:workspace-view-change'))});
  await page.waitForFunction(()=>document.getElementById('workWaitingReviews').parentElement.querySelector('.workspace-info-bar-v309>span').style.width==='25%');
  assert.equal(await page.locator('#workOpenActions').textContent(),'8');
  if(process.env.V309_SCREENSHOT_DIR&&width===390)await page.screenshot({path:path.join(process.env.V309_SCREENSHOT_DIR,'work-phone.png'),fullPage:true});
  await page.evaluate(()=>{document.getElementById('workWaitingReviews').parentElement.hidden=true});
  await page.waitForFunction(()=>document.getElementById('workWaitingReviews').parentElement.querySelector('.workspace-info-bar-v309').hidden);
  await page.evaluate(()=>{document.getElementById('workOpenActions').textContent='—'});
  await page.waitForFunction(()=>document.getElementById('workOpenActions').parentElement.querySelector('.workspace-info-bar-v309').hidden);
  assert.equal(await page.locator('#workNextDeadline').textContent(),'—','dates are not graphed as counts');
  await page.evaluate(()=>{window.__mutations=0;const observer=new MutationObserver(records=>window.__mutations+=records.length);observer.observe(document.getElementById('mainContent'),{subtree:true,childList:true,attributes:true,characterData:true});window.ThebeWorkspaceInfographicsV309.render();window.ThebeWorkspaceInfographicsV309.render()});
  await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.__mutations),0,'repeat rendering is stable, no observer starvation');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS V309: app-only release delivery, seven workspace visuals, 320–1280px containment, count truth/loading/role hiding, Property solid fills/aligned edges, calculator geometry and observer stability');
}finally{await browser.close()}
