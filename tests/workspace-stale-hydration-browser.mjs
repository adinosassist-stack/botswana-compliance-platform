import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const source=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
const start=source.indexOf('async function hydrateLazyWorkspaceView(id,target,options={})');
const end=source.indexOf('\nfunction enforceResidentPropertyVisibility',start);
assert(start>=0&&end>start,'active hydration function must exist');
const hydration=source.slice(start,end);
const messageStart=source.indexOf('function setLazyWorkspaceMessage(');
const messageEnd=source.indexOf('function activateLazyWorkspacePlaceholder(',messageStart);
assert(messageStart>=0&&messageEnd>messageStart,'active error renderer must exist');
const messages=source.slice(messageStart,messageEnd);
const security=fs.readFileSync('public/js/dom-security.js','utf8');
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  for(const width of [390,1280]){
    for(const scenario of ['abandon-and-revisit','return-while-pending','failure-and-retry','abandoned-failure']){
      const page=await browser.newPage({viewport:{width,height:844}});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      try{
        await page.setContent('<p id="srStatus"></p><section id="employees" data-lazy-view="1" data-lazy-navigation-epoch="1"><p>Loading employees</p></section>');
        await page.addScriptTag({content:security});
        await page.evaluate(({hydration,messages})=>{
          window.hydrationCheck=new Function(`
            "use strict";
            let workspaceViewNavigationEpoch=1,resolveShard,rejectShard,pending,shard;
            const target=document.getElementById('employees');
            const metrics={renders:0,shows:0,fetches:0,mutations:0};
            const observer=new MutationObserver(records=>{metrics.mutations+=records.length});
            observer.observe(target,{childList:true,subtree:true});
            const render=window.BW.dom.renderMarkup;
            window.BW.dom={...window.BW.dom,renderMarkup(...args){metrics.renders++;return render(...args)}};
            function workspaceViewFragments(){metrics.fetches++;return shard}
            function showView(){metrics.shows++;return true}
            function lazyWorkspaceViewLabel(){return 'Employees'}
            ${messages}
            ${hydration}
            return {
              begin(){shard=new Promise((resolve,reject)=>{resolveShard=resolve;rejectShard=reject});pending=hydrateLazyWorkspaceView('employees',target)},
              navigate(epoch,returning=false){workspaceViewNavigationEpoch=epoch;if(returning)target.dataset.lazyNavigationEpoch=String(epoch)},
              repeat(){return hydrateLazyWorkspaceView('employees',target)},
              async resolve(){resolveShard({employees:'<h2>Employees ready</h2>'+'<p>Employee details</p>'.repeat(1000)});await pending;await Promise.resolve()},
              async reject(){rejectShard(new Error('Synthetic fragment failure'));await pending;await Promise.resolve()},
              snapshot(){return {...metrics,lazy:target.dataset.lazyView,loading:target.dataset.lazyLoading,error:target.dataset.lazyError,busy:target.getAttribute('aria-busy'),text:target.textContent}}
            };
          `)();
        },{hydration,messages});
        await page.evaluate(()=>window.hydrationCheck.begin());
        if(scenario==='abandon-and-revisit'||scenario==='abandoned-failure'){
          await page.evaluate(()=>window.hydrationCheck.navigate(2));
          await page.evaluate(s=>s==='abandoned-failure'?window.hydrationCheck.reject():window.hydrationCheck.resolve(),scenario);
          const abandoned=await page.evaluate(()=>window.hydrationCheck.snapshot());
          assert.equal(abandoned.renders,0,'abandoned responses must never enter the sanitizer/DOM renderer');
          assert.equal(abandoned.mutations,0,'abandoned responses must not mutate placeholder content');
          assert.equal(abandoned.shows,0);
          assert.equal(abandoned.lazy,'1');
          assert.equal(abandoned.loading,undefined);
          assert.equal(abandoned.error,undefined);
          assert.equal(abandoned.busy,'false');
          if(scenario==='abandoned-failure'){
            console.log(`PASS active workspace hydration in Chromium: ${scenario} at ${width}px`);
            continue;
          }
          await page.evaluate(()=>{window.hydrationCheck.navigate(3,true);window.hydrationCheck.begin()});
        }else if(scenario==='return-while-pending'){
          await page.evaluate(async()=>{window.hydrationCheck.navigate(2);window.hydrationCheck.navigate(3,true);await window.hydrationCheck.repeat()});
          assert.equal(await page.evaluate(()=>window.hydrationCheck.snapshot().fetches),1,'returning to a pending route must share its request');
        }else{
          await page.evaluate(()=>window.hydrationCheck.reject());
          const failed=await page.evaluate(()=>window.hydrationCheck.snapshot());
          assert.equal(failed.error,'1');
          assert.equal(failed.busy,'false');
          assert.equal(failed.loading,undefined);
          assert.equal(failed.lazy,'1');
          assert.match(failed.text,/could not be loaded/);
          await page.evaluate(()=>window.hydrationCheck.begin());
        }
        await page.evaluate(()=>window.hydrationCheck.resolve());
        const ready=await page.evaluate(()=>window.hydrationCheck.snapshot());
        assert.equal(ready.renders,1,'winning navigation must render exactly once');
        assert.equal(ready.shows,1);
        assert.equal(ready.busy,'false');
        assert.equal(ready.lazy,undefined);
        assert.equal(ready.loading,undefined);
        assert.equal(ready.error,undefined);
        assert.match(ready.text,/Employees ready/);
      }finally{
        assert.deepEqual(errors,[],`${scenario} at ${width}px must not throw browser errors`);
        await page.close();
      }
      console.log(`PASS active workspace hydration in Chromium: ${scenario} at ${width}px`);
    }
  }
}finally{await browser.close()}
