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
   const schedule=new Function('renderAll',`let workspacePendingRenderToken=0;let workspaceViewNavigationEpoch=1;${implementation};return {scheduleWorkspaceNavigationRender,setEpoch:value=>workspaceViewNavigationEpoch=value}`)(renderAll);
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
 
 // Sanity-check frame scheduling in this isolated fixture only; this is not a production performance gate.
 const responsiveness=await page.evaluate(async ()=>{
   const before=performance.now();
   const frames=[];
   for(let i=0;i<5;i++)await new Promise(resolve=>requestAnimationFrame(()=>{frames.push(performance.now());resolve();}));
   const gaps=frames.slice(1).map((t,i)=>Math.round(t-frames[i]));
   return {elapsedMs:Math.round(performance.now()-before),maxFrameGapMs:Math.max(...gaps)};
 });
 assert.ok(responsiveness.maxFrameGapMs<250,'isolated navigation fixture blocked Chromium frames');
 // Exercise a representative synchronous render workload during navigation, not only after it.
 const workload=await page.evaluate(async implementation=>{
   const section=document.getElementById('work');
   const renderAll=()=>{const start=performance.now();while(performance.now()-start<80){};section.dataset.rendered='yes';};
   const schedule=new Function('renderAll',`let workspacePendingRenderToken=0;let workspaceViewNavigationEpoch=3;${implementation};return scheduleWorkspaceNavigationRender`)(renderAll);
   const begin=performance.now();schedule('work',section,3);
   await new Promise(resolve=>{const poll=()=>section.dataset.rendered==='yes'?resolve():setTimeout(poll,5);poll();});
   return Math.round(performance.now()-begin);
 },implementation);
 assert.ok(workload>=65,'representative render workload was not executed');
 console.log('INFO: synthetic navigation-to-render with 80ms main-thread work',workload);
 console.log('INFO: isolated Chromium frame responsiveness',JSON.stringify(responsiveness));
 console.log('PASS: real Chromium cancels stale navigation and renders latest destination');
}finally{await browser.close()}
