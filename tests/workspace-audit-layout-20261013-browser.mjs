import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const focus=fs.readFileSync('public/js/owner-focus-strip-v296.js','utf8').match(/style.textContent=`([\s\S]*?)`;/)[1].replaceAll('${STRIP_ID}','ownerFocusStrip').replaceAll('${ATTENTION_ID}','ownerAttentionPanel');
const protect=fs.readFileSync('public/js/protect-workspace-v308.js','utf8').match(/style.textContent=`([\s\S]*?)`;/)[1].replaceAll('${ROOT_ID}','protecthub');
const polish=fs.readFileSync('public/assets/workspace-audit-refinements-20261013.css','utf8');
const spatial=fs.readFileSync('public/assets/thebe-spatial-dock-v246.css','utf8');
const productionControls=fs.readFileSync('public/assets/workspace-control-polish-v317.css','utf8');
// Guard all three workspace surfaces against regression to the legacy red brand.
assert.doesNotMatch(polish,/#(?:b42318|8f1d16|fff1ee|efd1cc)\b|rgba\(180,35,24/i,'shared workspace, Owner Focus and AI dock must not inherit legacy red accents');
assert.match(polish,/\.btn:not\(\.alt\):not\(\.soft\):not\(\.danger\)\{background:#0b66d6!important\}/,'blue must not override explicit danger controls');
assert.match(polish,/#thebeAiDockPill\[data-surface="workspace"\]\{background:#0b66d6!important/,'collapsed AI dock pill must use shared blue');
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
    assert.equal(await page.locator('.owner-focus-ask').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(11, 102, 214)','production button styles must retain the blue action accent');
    assert.equal(await page.locator('.owner-analysis-details').getAttribute('open'),null,'analysis starts collapsed');
    await page.getByText('Business analysis & planning',{exact:true}).click();
    assert.notEqual(await page.locator('.owner-analysis-details').getAttribute('open'),null,'analysis remains reachable');
    await page.close();
  }
  for(const width of [390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0}#appShell{display:flex;min-height:100vh}#workspaceSidebar{width:220px;flex:none}#mainContent{flex:1;min-width:0}#mainContent>.top{height:72px}#workspaceSidebar .nav-primary{display:block} ${polish}</style><div id="appShell"><aside id="workspaceSidebar"><button class="nav-primary active">Home</button><button class="nav-primary">People</button></aside><main id="mainContent"><header class="top"><div><h2>Workspace</h2></div></header><section class="simplified-hub"><div class="hub-hero"><h2>Overview</h2></div></section></main></div>`);
    const state=await page.evaluate(()=>({canvas:getComputedStyle(document.querySelector('#mainContent')).backgroundColor,header:getComputedStyle(document.querySelector('#mainContent>.top')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,active:getComputedStyle(document.querySelector('.nav-primary.active')).backgroundColor}));
    assert.equal(state.canvas,'rgb(247, 249, 252)',`flat canvas at ${width}`);
    assert.equal(state.header,'rgb(255, 255, 255)',`white header at ${width}`);
    assert.equal(state.overflow,false,`workspace shell fits at ${width}`);
    assert.equal(state.active,'rgb(11, 102, 214)',`blue active navigation at ${width}`);
    await page.close();
  }
  // Verify dock-open presentation without pretending this synthetic fixture tests drag/resize behavior.
  {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.setContent(`<!doctype html><style>${spatial}${polish}</style><div id="thebeAiDock" class="thebe-ai-dock" data-surface="workspace"><div class="thebe-ai-compose"><textarea aria-label="Message"></textarea></div><button class="thebe-ai-minimize">Minimize</button></div>`);
    await page.evaluate(()=>document.body.classList.add('thebe-ai-dock-open'));
    await page.locator('textarea').focus();
    const state=await page.evaluate(()=>({compose:getComputedStyle(document.querySelector('.thebe-ai-compose')).backgroundColor,focus:getComputedStyle(document.querySelector('textarea')).outlineColor,minimize:getComputedStyle(document.querySelector('.thebe-ai-minimize')).display,minimizeHeight:document.querySelector('.thebe-ai-minimize').getBoundingClientRect().height}));
    assert.equal(state.compose,'rgb(36, 36, 36)','dock-open composer inherits the canonical charcoal surface');
    assert.ok(['inline-flex','flex'].includes(state.minimize)&&state.minimizeHeight>0,'dock-open minimize action stays visible');
    await page.close();
  }
  console.log('PASS workspace layout: contained priority controls and badges, >=44px controls, no horizontal overflow, analysis disclosure at 320–1280px');
}finally{await browser.close()}
