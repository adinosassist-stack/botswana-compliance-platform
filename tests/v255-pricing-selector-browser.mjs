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
const homepagePlans=[
  {name:'Monitor',price:'P149',href:'/auth/?mode=register&plan=starter'},
  {name:'Protect',price:'P349',href:'/auth/?mode=register&plan=business'},
  {name:'Control',price:'P699',href:'/auth/?mode=register&plan=pro'}
];
const pricingPlans=[
  {name:'Monitor',price:'P149',radio:'pricingPlanMonitor',panel:'pricingPanelMonitor'},
  {name:'Protect',price:'P349',radio:'pricingPlanProtect',panel:'pricingPanelProtect'},
  {name:'Control',price:'P699',radio:'pricingPlanControl',panel:'pricingPanelControl'},
  {name:'Network',price:'P1,299',radio:'pricingPlanNetwork',panel:'pricingPanelNetwork'},
  {name:'Partner',price:'P2,499',radio:'pricingPlanPartner',panel:'pricingPanelPartner'}
];

const executablePath=[
  process.env.CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});

async function visiblePanelIds(page,ids){
  return page.evaluate(panelIds=>panelIds.filter(id=>{
    const el=document.getElementById(id);
    if(!el)return false;
    const style=getComputedStyle(el),rect=el.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
  }),ids);
}

async function verifyHomepage(page,url){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  const cards=page.locator('#pricing .pricing-grid .pricecard');
  assert.equal(await cards.count(),3,'homepage must present exactly the three primary SME plans');
  for(let i=0;i<homepagePlans.length;i+=1){
    const plan=homepagePlans[i],card=cards.nth(i);
    assert.equal((await card.locator('h3').textContent()).trim(),plan.name,'homepage plan order must remain Monitor, Protect, Control');
    assert((await card.locator('.price').textContent()).includes(plan.price),'homepage must keep published '+plan.name+' price');
    assert.equal(await card.locator('.marketing-start-action').getAttribute('href'),plan.href,'homepage '+plan.name+' CTA must preserve plan registration mapping');
    const geometry=await card.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.getBoundingClientRect().height}));
    assert(geometry.scrollWidth<=geometry.width+1,'homepage '+plan.name+' card must fit its container');
    assert(geometry.height>0,'homepage '+plan.name+' card must remain visible');
  }
  assert.equal(await cards.nth(1).evaluate(el=>el.classList.contains('featured')),true,'Protect must remain the recommended homepage plan');
  assert.equal(await page.locator('#pricing .pricing-tabs').count(),0,'homepage must not restore the retired five-plan selector');
  assert.equal(await page.locator('#pricing .secondary-plans a[href="/pricing/"]').count(),1,'homepage must link to full Network and Partner pricing');
  const grid=await page.locator('#pricing .pricing-grid').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,columns:getComputedStyle(el).gridTemplateColumns}));
  assert(grid.scrollWidth<=grid.width+1,'homepage pricing grid must not overflow');
  const viewport=page.viewportSize();
  if(viewport&&viewport.width<=760){
    const columnCount=grid.columns.split(' ').filter(Boolean).length;
    assert.equal(columnCount,1,'homepage primary plans must stack into one column on mobile');
  }
}

async function verifyFullPricing(page,url){
  const panelIds=pricingPlans.map(plan=>plan.panel);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#'+pricingPlans[1].radio).isChecked(),true,url+' must default to Protect');
  assert.deepEqual(await visiblePanelIds(page,panelIds),[pricingPlans[1].panel],url+' must show only Protect by default');
  for(const plan of pricingPlans){
    await page.locator('label[for="'+plan.radio+'"]').click();
    assert.equal(await page.locator('#'+plan.radio).isChecked(),true,url+' must select '+plan.name);
    assert.deepEqual(await visiblePanelIds(page,panelIds),[plan.panel],url+' must show only '+plan.name+' after selection');
    assert.equal((await page.locator('#'+plan.panel+' h3').textContent()).trim(),plan.name,url+' selected card heading must match '+plan.name);
    assert((await page.locator('#'+plan.panel+' .price').textContent()).includes(plan.price),url+' selected card must keep published '+plan.name+' price');
    const geometry=await page.locator('#'+plan.panel).evaluate(el=>{
      const heading=el.querySelector('h3').getBoundingClientRect(),price=el.querySelector('.price').getBoundingClientRect(),description=el.querySelector('p').getBoundingClientRect(),action=el.querySelector('.btn').getBoundingClientRect();
      return {direction:getComputedStyle(el).flexDirection,headingBottom:heading.bottom,priceTop:price.top,priceBottom:price.bottom,descriptionTop:description.top,descriptionBottom:description.bottom,actionTop:action.top,width:el.clientWidth,scrollWidth:el.scrollWidth};
    });
    assert.equal(geometry.direction,'column',url+' selected card must stack its plan details');
    assert(geometry.priceTop>=geometry.headingBottom-1&&geometry.descriptionTop>=geometry.priceBottom-1&&geometry.actionTop>=geometry.descriptionBottom-1,url+' plan heading, price, description and action must remain ordered vertically');
    assert(geometry.scrollWidth<=geometry.width+1,url+' plan card must fit its container');
  }
  const tabs=await page.locator('.plan-tabs').evaluate(el=>({overflowX:getComputedStyle(el).overflowX,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
  const viewport=page.viewportSize();
  if(viewport&&viewport.width<=760){
    assert(['auto','scroll'].includes(tabs.overflowX),url+' mobile pricing tabs must be horizontally scrollable');
    assert(tabs.scrollWidth>tabs.clientWidth,url+' mobile pricing tabs must preserve all five plan choices without compression');
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
    await verifyHomepage(page,'http://localhost/');
    await verifyFullPricing(page,'http://localhost/pricing/');
  }
  console.log('V255_PRICING_SELECTOR_BROWSER_PASS: homepage shows three direct-buy SME plans while full pricing preserves all five selectors on desktop and mobile.');
}finally{
  await browser.close();
}
