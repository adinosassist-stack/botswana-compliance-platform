import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright')
  : 'playwright-core');

const home=fs.readFileSync('public/home.html','utf8');
const pricing=fs.readFileSync('public/pricing/index.html','utf8');
const plans=[
  {name:'Monitor',price:'P149',homeRadio:'homePricingMonitor',homePanel:'homePricingPanelMonitor',pricingRadio:'pricingPlanMonitor',pricingPanel:'pricingPanelMonitor'},
  {name:'Protect',price:'P349',homeRadio:'homePricingProtect',homePanel:'homePricingPanelProtect',pricingRadio:'pricingPlanProtect',pricingPanel:'pricingPanelProtect'},
  {name:'Control',price:'P699',homeRadio:'homePricingControl',homePanel:'homePricingPanelControl',pricingRadio:'pricingPlanControl',pricingPanel:'pricingPanelControl'},
  {name:'Network',price:'P1,299',homeRadio:'homePricingNetwork',homePanel:'homePricingPanelNetwork',pricingRadio:'pricingPlanNetwork',pricingPanel:'pricingPanelNetwork'},
  {name:'Partner',price:'P2,499',homeRadio:'homePricingPartner',homePanel:'homePricingPanelPartner',pricingRadio:'pricingPlanPartner',pricingPanel:'pricingPanelPartner'}
];

const executablePath=[
  process.env.CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean).find(p=>fs.existsSync(p));

const browser=await chromium.launch({
  headless:true,
  executablePath,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
});

async function visiblePanelIds(page,ids){
  return page.evaluate(panelIds=>panelIds.filter(id=>{
    const el=document.getElementById(id);
    if(!el)return false;
    const style=getComputedStyle(el),rect=el.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
  }),ids);
}

async function verifySurface(page,{url,radioKey,panelKey,tabsSelector}){
  const panelIds=plans.map(plan=>plan[panelKey]);
  await page.goto(url,{waitUntil:'domcontentloaded'});

  assert.equal(await page.locator('#'+plans[1][radioKey]).isChecked(),true,
    url+' must default to Protect');
  assert.deepEqual(await visiblePanelIds(page,panelIds),[plans[1][panelKey]],
    url+' must show only Protect by default');

  for(const plan of plans){
    const radio=plan[radioKey],panel=plan[panelKey];
    await page.locator('label[for="'+radio+'"]').click();
    assert.equal(await page.locator('#'+radio).isChecked(),true,
      url+' must select '+plan.name);
    assert.deepEqual(await visiblePanelIds(page,panelIds),[panel],
      url+' must show only '+plan.name+' after selection');
    assert.equal((await page.locator('#'+panel+' h3').textContent()).trim(),plan.name,
      url+' selected card heading must match '+plan.name);
    assert((await page.locator('#'+panel+' .price').textContent()).includes(plan.price),
      url+' selected card must keep published '+plan.name+' price');
  }

  const tabs=await page.locator(tabsSelector).evaluate(el=>({
    overflowX:getComputedStyle(el).overflowX,
    scrollWidth:el.scrollWidth,
    clientWidth:el.clientWidth
  }));
  const viewport=page.viewportSize();
  if(viewport&&viewport.width<=760){
    assert(['auto','scroll'].includes(tabs.overflowX),
      url+' mobile pricing tabs must be horizontally scrollable');
    assert(tabs.scrollWidth>tabs.clientWidth,
      url+' mobile pricing tabs must preserve all five plan choices without compression');
  }
}

try{
  const page=await browser.newPage({viewport:{width:1200,height:1000}});
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:home});
    if(pathname==='/pricing/'||pathname==='/pricing')return route.fulfill({contentType:'text/html',body:pricing});
    if(pathname.endsWith('.js'))return route.fulfill({contentType:'application/javascript',body:''});
    if(/\.(png|webp|jpg|jpeg|svg)$/.test(pathname))return route.fulfill({status:204,body:''});
    return route.fulfill({status:404,body:''});
  });

  for(const viewport of [{width:1200,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await verifySurface(page,{
      url:'http://localhost/',
      radioKey:'homeRadio',
      panelKey:'homePanel',
      tabsSelector:'#pricing .pricing-tabs'
    });
    await verifySurface(page,{
      url:'http://localhost/pricing/',
      radioKey:'pricingRadio',
      panelKey:'pricingPanel',
      tabsSelector:'.plan-tabs'
    });
  }

  console.log('V255_PRICING_SELECTOR_BROWSER_PASS: home and pricing selectors switch all five plans on desktop and mobile.');
}finally{
  await browser.close();
}
