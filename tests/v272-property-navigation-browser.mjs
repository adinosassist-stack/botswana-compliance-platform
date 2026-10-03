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
const property=html.slice(propertyStart,html.indexOf('</section>',propertyStart)+10).replace('class="view simplified-hub','class="view active simplified-hub').replace('</section>','<section id="propertyPortfolioWorkspace"><details id="propertyValuationServicePanel"><summary>Professional valuation</summary><button id="propertyValuationServiceRequestButton">Request valuation</button></details><details id="propertyAssetFormPanel"><summary>Add property</summary></details></section></section>');
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
   if(pathname.endsWith('.js')&&!pathname.includes('property-visibility'))return route.fulfill({contentType:'application/javascript',body:''});
   const file='public'+pathname;
   return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
 });
 await page.goto('http://localhost/');
 await page.waitForSelector('.property-primary-v260');
 assert.deepEqual(await page.locator('.property-primary-v260 [role="tab"]').allTextContents(),['Today','Properties','Analyse','Operations']);
 assert.equal(await page.locator('.property-calculator-v224').isVisible(),false,'Today must not leak the Analyse calculator');
 await page.getByRole('tab',{name:'Analyse',exact:true}).click();
 assert.equal(await page.locator('.property-calculator-v224').isVisible(),true);
 await page.locator('#propertyPurchasePrice').fill('1000000');
 await page.locator('#propertyMonthlyRent').fill('5000');
 await page.locator('.property-analysis-tools-v272').getByRole('button',{name:'Compare properties',exact:true}).click();
 assert.equal(await page.locator('.property-compare-v264').isVisible(),true);
 assert.equal(await page.locator('.property-calculator-v224').isVisible(),false);
 assert.equal(await page.getByRole('tab',{name:'Analyse',exact:true}).getAttribute('aria-selected'),'true');
 assert.match(await page.locator('.property-compare-current-detail-v264').innerText(),/6.0% gross yield/);
 await page.locator('.property-analysis-tools-v272').getByRole('button',{name:'Optimise',exact:true}).click();
 assert.equal(await page.locator('.property-optimise-v263').isVisible(),true);
 assert.equal(await page.locator('.property-compare-v264').isVisible(),false);
 await page.getByRole('tab',{name:'Operations',exact:true}).click();
 assert.equal(await page.locator('.property-operations-v262').isVisible(),true,'operations are outside hidden Properties parent');
 assert.equal(await page.locator('#propertyValuationServicePanel > summary').isVisible(),true,'valuation disclosure is reachable through Operations');
 await page.locator('#propertyValuationServicePanel > summary').click();
 assert.equal(await page.locator('#propertyValuationServiceRequestButton').isVisible(),true,'valuation request is reachable through the visible disclosure');
 assert.equal(await page.locator('#propertyPortfolioWorkspace').isVisible(),false,'Properties stays scoped to its tab');
 await page.getByRole('tab',{name:'Properties',exact:true}).click();
 assert.equal(await page.locator('#propertyPortfolioWorkspace').isVisible(),true);
 assert.equal(await page.locator('#propertyValuationServicePanel').isVisible(),false,'valuation stays scoped to Operations');
 // Repair an existing nested operational panel without recreating or losing controls.
 await page.evaluate(()=>{document.getElementById('propertyPortfolioWorkspace').append(document.querySelector('.property-operations-v262'));window.ThebePropertyVisibility.repair()});
 await page.getByRole('tab',{name:'Operations',exact:true}).click();
 assert.equal(await page.locator('.property-operations-v262').isVisible(),true,'repair promotes already-mounted operational panels');
 await page.getByRole('tab',{name:'Today',exact:true}).click();
 assert.equal(await page.locator('.property-calculator-v224').isVisible(),false,'late visibility recovery must respect the selected pane');
 assert.equal(await page.locator('.property-analysis-tools-v272').isVisible(),false);
 for(const href of await page.locator('link[data-thebe-property-operations-v262],link[data-thebe-property-optimise-v263],link[data-thebe-property-compare-v264]').evaluateAll(nodes=>nodes.map(node=>node.href)))assert.equal(new URL(href).searchParams.get('release'),'9'.repeat(40));
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.property-primary-v260 [role="tab"]').count(),4);
 const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 assert(geometry.scroll<=geometry.width+1,'Property must fit mobile width');
 assert.deepEqual(errors,[]);
 console.log('V272_PROPERTY_NAVIGATION_BROWSER_PASS');
}finally{await browser.close()}
