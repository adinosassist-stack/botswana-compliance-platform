import assert from 'node:assert/strict';

// Shared by the disposable-tenant lifecycle and the isolated browser regression.
export async function provePeopleLocationNetworkRecovery(page,{timeoutMs=40000}={}){
 const origin=new URL(page.url()).origin;
 const matches=url=>{
  if(url.origin!==origin)return false;
  const path=url.pathname==='/'?url.searchParams.get('__thebe_api_path'):url.pathname.replace(/^\/__thebe_api(?=\/)/,'/api');
  return path==='/api/daily-reporting/locations';
 };
 const fields=['opsLocationName','opsLocationCode','opsLocationTown'];
 const before=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value])),fields);
 assert.ok(before.opsLocationName.length>=2,'network probe requires the prepared synthetic draft');
 let blocked=0;
 const abort=async route=>{if(route.request().method()!=='POST')return route.fallback();blocked++;await route.abort('failed')};
 const button=page.locator('#peopleops [data-bw-onclick="addOpsLocation()"]:visible').first();
 await page.route(matches,abort);
 try{
  await button.click();
  await page.waitForFunction(()=>document.getElementById('opsLocationStatus')?.dataset.state==='error'&&!document.querySelector('#peopleops [data-bw-onclick="addOpsLocation()"]').disabled,null,{timeout:timeoutMs});
  assert.ok(blocked>0,'probe must interrupt an actual location POST');
  const after=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value])),fields);
  assert.deepEqual(after,before,'failed authenticated save must retain all draft fields');
  const scroll=await page.evaluate(()=>scrollY);
  await page.waitForTimeout(350); // The old decorator scheduled a focus change at 220ms.
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'opsLocationName','failed save must not force focus back into the form');
  assert.equal(await page.evaluate(()=>scrollY),scroll,'failed save must not move the viewport');
  assert.equal(await button.getAttribute('aria-busy'),null,'failed save must release its busy state');
 }finally{await page.unroute(matches,abort)}
 console.log('PASS People location network recovery: intercepted POST, retained draft, restored control and stable focus/scroll; interception removed for real retry');
}
