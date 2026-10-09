import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const styles=['workspace-inline-styles-20261001c.css','owner-command-centre.css','workspace-command-center-v230.css','workspace-command-center-v231.css','workspace-home-density-v234.css','workspace-reference-shell-v237.css','workspace-home-command-v238.css','property-operations-v262.css'];
const canonical=fs.readFileSync('public/index.html','utf8');
const compose=canonical.match(/<div class="home-thebe-agent executive-only"[\s\S]*?<\/div>\s*<\/div>\s*<div class="home-decision-grid/)[0].replace(/<div class="home-decision-grid$/,'');
const html=versionReleaseAssets(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(x=>`<link rel="stylesheet" href="/assets/${x}">`).join('')}</head><body><div id="appShell"><main id="mainContent"><section id="dashboard" class="active"><section id="homeDecisionCenter">${compose}</section></section><section id="propertyintelligence"><div class="property-ops-actions-v262"><button class="property-ops-action-v262">Build lease checklist</button><button class="property-ops-action-v262">Plan rent collection</button><button class="property-ops-action-v262">Create maintenance plan</button></div></section></main></div><script src="/fixture.js" nonce="fixture-nonce"></script><script src="/js/owner-command-centre.js"></script></body></html>`,'a'.repeat(40),{includeWorkspaceFixes:true});
const bootstrap=`window.currentWorkspaceRole=()=>"owner";window.pendingBriefRejects=[];window.pendingBriefUrls=[];window.apiJson=url=>{window.pendingBriefUrls.push(url);return new Promise((resolve,reject)=>window.pendingBriefRejects.push(reject))};window.rejectBrief=()=>window.pendingBriefRejects.splice(0).forEach(reject=>reject(new Error("Source unavailable")));Object.defineProperty(Element.prototype,"safeHTML",{set(value){this.innerHTML=value},configurable:true});`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  for(const width of [320,390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:1000}});
    const violations=[];
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    page.on('console',message=>{if(/Refused to apply|Applying inline style violates/.test(message.text()))violations.push(message.text())});
    await page.route('http://fixture.test/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/')return route.fulfill({body:html,contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'self'; script-src 'self' 'nonce-fixture-nonce'; style-src 'self'; style-src-elem 'self' 'nonce-fixture-nonce'; style-src-attr 'unsafe-inline'"}});
      if(url.pathname==='/fixture.js')return route.fulfill({body:bootstrap,contentType:'application/javascript'});
      if(url.pathname.endsWith('.js')&&!['/js/owner-command-centre.js','/js/owner-focus-strip-v296.js'].includes(url.pathname))return route.fulfill({body:'',contentType:'application/javascript'});
      const file=path.join('public',url.pathname);
      return fs.existsSync(file)?route.fulfill({body:fs.readFileSync(file),contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript'}):route.abort();
    });
    await page.goto('http://fixture.test/');
    await page.waitForFunction(()=>document.querySelector('#ownerFocusStrip')?.dataset.state==='loading');
    const layout=await page.evaluate(()=>{
      const compose=document.querySelector('.home-thebe-agent-compose'),input=compose.querySelector('input'),button=compose.querySelector('button');
      const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
      return {compose:rect(compose),input:rect(input),button:rect(button),stripDisplay:getComputedStyle(document.querySelector('#ownerFocusStrip')).display,buttonBackground:getComputedStyle(button).backgroundColor,metrics:[...document.querySelectorAll('.owner-focus-metric')].map(rect),panels:[...document.querySelectorAll('#ownerCommandCentre .owner-panel')].map(x=>x.textContent.trim()),property:[...document.querySelectorAll('.property-ops-action-v262')].map(rect)};
    });
    assert.equal(layout.stripDisplay,'grid',`Owner focus styles must survive production CSP at ${width}`);
    assert.ok(layout.button.width>=92&&layout.button.height>=44,'Ask Thebe must be a readable touch target');
    assert.ok(Math.abs((layout.input.top+layout.input.bottom)-(layout.button.top+layout.button.bottom))<=3,'input and Ask Thebe must share a vertical center');
    assert.ok(layout.button.right<=layout.compose.right+1&&layout.button.bottom<=layout.compose.bottom+1,'Ask Thebe must stay inside its container');
    assert.ok(layout.metrics.every(x=>x.height>=44),'all metric controls need usable touch targets');
    assert.ok(layout.panels.every(Boolean),'every owner panel must describe its loading state');
    assert.ok(layout.property.every(x=>x.height>=44),'property planning controls need usable touch targets');
    assert.deepEqual(violations,[],'injected owner styles must satisfy the production CSP');
    await page.waitForFunction(()=>window.pendingBriefUrls.some(url=>url.startsWith("/api/daily-reporting/performance")));
    await page.evaluate(()=>window.rejectBrief());
    await page.waitForFunction(()=>document.querySelector('#ownerFocusStrip')?.dataset.state==='unavailable');
    for(const id of ['ownerAttentionPanel','ownerResponsibilityPanel','ownerAnalyticsPanel','ownerActionPanel','ownerSimulationPanel','ownerGoalsIdeas'])assert.match(await page.locator('#'+id).innerText(),/unavailable/i,`${id} must explain unavailable data`);
    assert.equal(await page.locator('.owner-focus-value').first().innerText(),'—','unavailable priorities must not claim zero');
    assert.deepEqual(errors,[],'workspace controls must not throw browser errors');
    await page.close();
  }
  console.log('V317 workspace controls: CSP, alignment, touch targets, loading and failure states PASS at 320/390/768/1440px');
}finally{await browser.close()}
