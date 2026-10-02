import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=fs.readFileSync('public/index.html','utf8');
const start=html.indexOf('async function removeEmployeeRecord('),end=html.indexOf('\n}',start)+2;
assert(start>=0&&end>start,'real removeEmployeeRecord source must exist');
const removeSource=html.slice(start,end);
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
 const page=await browser.newPage();
 await page.setContent('<div id="employeeRegister"><div data-employee-id="emp-1">Employee</div></div><section id="peopleops"></section><section id="dailyreports"></section>');
 await page.evaluate(src=>{
   window.STANDALONE_PREVIEW=false;window.recentlyRemovedEmployeeIds=new Set();
   window.__activeEmployeesById={'emp-1':{id:'emp-1'}};window.__employeeReporterLinks={'emp-1':{id:'link-1'}};
   window.BW={dialog:{confirm:async()=>true}};window.calls=[];window.apiJson=async(url,opts)=>{calls.push(['api',url,opts?.method]);return {}};
   for(const name of ['renderEmployeeRegister','renderPeopleOperationsHub','renderPeopleReportingSetup','renderEmployeesForHr','renderOwnerDailyBrief','renderDailyOperations'])window[name]=async()=>calls.push([name]);
   window.notifyUser=(message,opts)=>calls.push(['notify',message,opts?.type]);
   window.CSS=window.CSS||{};if(!window.CSS.escape)window.CSS.escape=value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&');
   (0,eval)(src);
 },removeSource);
 await page.evaluate(()=>removeEmployeeRecord('emp-1'));
 const result=await page.evaluate(()=>({calls,employeePresent:!!document.querySelector('[data-employee-id="emp-1"]'),active:__activeEmployeesById['emp-1'],reporter:__employeeReporterLinks['emp-1']}));
 assert.equal(result.employeePresent,false,'removed employee card must disappear immediately');
 assert.equal(result.active,undefined,'active employee cache must close immediately');
 assert.equal(result.reporter,undefined,'reporter link cache must close immediately');
 assert.deepEqual(result.calls.slice(0,6),[
   ['api','/api/employees/emp-1','DELETE'],
   ['renderEmployeeRegister'],
   ['renderPeopleOperationsHub'],
   ['renderPeopleReportingSetup'],
   ['renderEmployeesForHr'],
   ['renderOwnerDailyBrief']
 ],'removal must reconcile every employee-dependent surface without navigation or refresh');
 assert.equal(result.calls.some(call=>call[0]==='renderDailyOperations'),false,'inactive Daily Operations must not be needlessly rerendered');
 assert.equal(result.calls.at(-1)?.[0],'notify','success notification must follow completed mutation closure');
 console.log('V258_EMPLOYEE_REMOVAL_BROWSER_PASS: real removal mutation reconciles all dependent surfaces without reload');
}finally{await browser.close()}
