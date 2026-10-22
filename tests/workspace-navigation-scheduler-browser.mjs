import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const source=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
const start=source.indexOf('function scheduleWorkspaceNavigationRender(');
const end=source.indexOf('\nlet lastWorkspaceView=',start);
assert(start>=0&&end>start,'navigation scheduling implementation must exist');
const implementation=source.slice(start,end);
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setContent('<section id="people" class="active"></section><section id="work"></section>');
 const results=await page.evaluate(async implementation=>{
   const calls=[];
   let workspacePendingRenderToken=0,workspaceViewNavigationEpoch=1;
   const renderAll=()=>calls.push({time:performance.now(),active:document.querySelector('.active')?.id});
   const schedule=new Function('renderAll','getEpoch',`let workspacePendingRenderToken=0;let workspaceViewNavigationEpoch=1;${implementation};return {scheduleWorkspaceNavigationRender,setEpoch:value=>workspaceViewNavigationEpoch=value}`)(renderAll,()=>workspaceViewNavigationEpoch);
   const people=document.getElementById('people'),work=document.getElementById('work');
   schedule.scheduleWorkspaceNavigationRender('people',people,1);
   people.classList.remove('active');work.classList.add('active');
   schedule.setEpoch(2);
   schedule.scheduleWorkspaceNavigationRender('work',work,2);
   await new Promise(resolve=>setTimeout(resolve,100));
   return calls;
 },implementation);
 assert.equal(results.length,1,'superseded navigation must not render');
 assert.equal(results[0].active,'work','only the latest destination may render');
 console.log('PASS: real Chromium cancels stale navigation and renders latest destination');
}finally{await browser.close()}
