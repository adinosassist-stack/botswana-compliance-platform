import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const focus=fs.readFileSync('public/js/owner-focus-strip-v296.js','utf8').match(/style.textContent=`([\s\S]*?)`;/)[1].replaceAll('${STRIP_ID}','ownerFocusStrip').replaceAll('${ATTENTION_ID}','ownerAttentionPanel');
const protect=fs.readFileSync('public/js/protect-workspace-v308.js','utf8').match(/style.textContent=`([\s\S]*?)`;/)[1].replaceAll('${ROOT_ID}','protecthub');
const polish=fs.readFileSync('public/assets/workspace-audit-refinements-20261013.css','utf8');
const productionControls=fs.readFileSync('public/assets/workspace-control-polish-v317.css','utf8');
const metrics=['Needs action','Approvals','Pending outcomes'].map(label=>`<button class="owner-focus-metric"><span class="owner-focus-value">6</span><span class="owner-focus-label">${label}</span></button>`).join('');
const lanes=['No open action returned','No near-term date returned','No gap returned'].map(label=>`<article class="protect-v308-lane"><div class="protect-v308-lane-head"><div><h3>Review protection gaps</h3></div><span class="protect-v308-badge">${label}</span></div><p>Open the source records.</p></article>`).join('');
const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(file=>fs.existsSync(file)),args:['--no-sandbox']});
try{
  for(const width of [320,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;font:14px Arial}#appShell{padding:12px;width:min(100%,720px)}${productionControls}${polish}</style><style>${focus}${protect}</style><div id="appShell"><section id="ownerFocusStrip"><div class="owner-focus-intro">Owner focus</div>${metrics}<button class="owner-focus-next">Review next</button><button class="owner-focus-retry">Retry priorities</button><button class="owner-focus-ask">Ask Thebe</button></section><section id="protecthub"><div class="protect-v308-work-grid">${lanes}</div></section><details class="owner-analysis-details"><summary>Business analysis & planning</summary><p>Analysis</p></details></div>`);
    const result=await page.evaluate(()=>{
      const strip=document.getElementById('ownerFocusStrip'),rect=strip.getBoundingClientRect();
      const outside=[...strip.querySelectorAll('button')].filter(el=>{const r=el.getBoundingClientRect();return r.left<rect.left||r.right>rect.right+.5||r.height<43.5}).map(el=>el.textContent);
      const badgeOutside=[...document.querySelectorAll('.protect-v308-badge')].filter(el=>{const r=el.getBoundingClientRect(),p=el.closest('article').getBoundingClientRect();return r.left<p.left||r.right>p.right+.5}).map(el=>el.textContent);
      return {outside,badgeOutside,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.deepEqual(result.outside,[],`focus controls contained and touch-sized at ${width}`);
    assert.deepEqual(result.badgeOutside,[],`protection badges contained at ${width}`);
    assert.equal(result.overflow,false,`no horizontal overflow at ${width}`);
    assert.equal(await page.locator('.owner-focus-ask').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(180, 35, 24)','production button styles must retain the red accent');
    assert.equal(await page.locator('.owner-analysis-details').getAttribute('open'),null,'analysis starts collapsed');
    await page.getByText('Business analysis & planning',{exact:true}).click();
    assert.notEqual(await page.locator('.owner-analysis-details').getAttribute('open'),null,'analysis remains reachable');
    await page.close();
  }
  console.log('PASS workspace layout: contained priority controls and badges, >=44px controls, no horizontal overflow, analysis disclosure at 320–1280px');
}finally{await browser.close()}
