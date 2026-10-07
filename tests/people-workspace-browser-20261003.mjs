import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=fs.readFileSync('public/index.html','utf8');
const section=html.slice(html.indexOf('<section id="peopleops"'),html.indexOf('<section id="businesshub"'));
const styles=[...html.slice(0,html.indexOf('</head>')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n')+['workspace-command-center-v230.css','workspace-command-center-v231.css','workspace-reference-shell-v237.css','people-workspace-20261003.css','people-infographics-20261003.css'].map(f=>fs.readFileSync('public/assets/'+f,'utf8')).join('\n');
const start=html.indexOf('function renderPeopleInfographics(');
const end=html.indexOf('\nasync function refreshPeopleWorkspace()',start);
const infographicSource=html.slice(start,end);
const securitySource=fs.readFileSync('public/js/dom-security.js','utf8');
const readinessSource=fs.readFileSync('public/js/workspace-readiness-v305.js','utf8');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});

try{
  for(const width of [390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.setContent(`<style>${styles}</style><div id="appShell"><main id="mainContent" style="margin:0;padding:16px">${section.replace('view simplified-hub','view active simplified-hub')}</main></div>`);
    await page.addScriptTag({content:securitySource});
    await page.addScriptTag({content:readinessSource});
    await page.evaluate(()=>{window.__THEBE_WORKSPACE_READY__=true;window.dispatchEvent(new Event('thebe:workspace-ready'))});
    await page.evaluate(src=>{
      window.escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      (0,eval)(src);
      renderPeopleInfographics({dash:{reportingPopulation:{expected:6,expectedSubmitted:4},branches:[
        {name:'Gaborone office',expected:1,submittedExpected:1},
        {name:'Francistown office',expected:1,submittedExpected:1},
        {name:'Palapye office',expected:1,submittedExpected:1},
        {name:'Maun office',expected:1,submittedExpected:1},
        {name:'Letlhakane office',expected:1,submittedExpected:0},
        {name:'Mahalapye office',expected:1,submittedExpected:0}
      ]},coverage:67,high:1,openCases:1});
      document.getElementById('peopleActiveEmployees').textContent='6';
      document.getElementById('peopleReportingCoverage').textContent='67%';
      document.getElementById('peopleOpenCases').textContent='1';
      document.getElementById('peopleProtectionBand').textContent='Low';
      const progress=document.getElementById('peopleReportingProgress');progress.hidden=false;progress.value=67;
      document.getElementById('peopleRefreshStatus').textContent='Updated 18:30 · Botswana time';
    },infographicSource);
    await page.waitForFunction(()=>document.querySelectorAll('.people-location-bar:not([hidden])').length===4&&!!document.querySelector('.people-location-more'));

    assert(await page.locator('#peopleReportingDonut').isVisible());
    assert.equal(await page.locator('#peopleDonutPercent').textContent(),'67%');
    assert(await page.locator('#peopleops').isVisible());
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false,`no horizontal overflow at ${width}`);

    const columns=await page.locator('.people-infographics').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length);
    assert.equal(columns,width<=620?1:width<=1050?2:3,`expected responsive infographic columns at ${width}`);
    assert.equal(await page.locator('.people-location-bar').count(),6,'all location rows remain in the DOM');
    assert.equal(await page.locator('.people-location-bar:not([hidden])').count(),4,'overview shows only four locations');
    assert(await page.locator('.people-location-more').isVisible());
    assert.equal(await page.locator('.people-location-more').textContent(),'View all 6 locations →');

    for(const id of ['peopleActiveEmployees','peopleOpenCases'])assert(await page.locator('#'+id).isVisible(),id+' visible');
    assert.equal(await page.locator('#opsReportingSetupDetails').getAttribute('open'),null,'Reporting setup starts collapsed');
    await page.locator('#opsReportingSetupDetails > summary').click();
    for(const id of ['opsLocationName','opsReporterEmployee'])assert(await page.locator('#'+id).isVisible(),id+' visible after setup disclosure');

    assert.equal(await page.locator('.people-automation-details').getAttribute('open'),null);
    await page.locator('.people-automation-details summary').click();
    assert(await page.locator('#opsAutoSummary').isVisible());

    if(width<=620){
      for(const selector of ['.people-info-legend button','.people-location-bar:not([hidden])','.people-followup-step','.people-location-more']){
        const box=await page.locator(selector).first().boundingBox();
        assert(box&&box.height>=44,`${selector} must be at least 44px high on mobile`);
      }
    }

    await page.screenshot({path:`/tmp/people-${width}.png`,fullPage:true});
    await page.close();
  }
  console.log('People V306 layout PASS at 390, 768, 1280px; phone stack, bounded locations, collapsed setup, touch targets and no overflow verified');
}finally{
  await browser.close();
}
