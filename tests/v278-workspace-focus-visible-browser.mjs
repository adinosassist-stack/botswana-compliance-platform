import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const fixture=`<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="appShell">
  <button id="workspaceButton" type="button">Workspace action</button>
  <a id="workspaceLink" href="#next">Open next</a>
</div>
<button id="thebeAiDockPill" type="button">Open Thebe</button>
<div id="thebeAiDock"><button id="dockButton" type="button">Voice</button></div>
<script src="/js/workspace-focus-visible-v278.js"></script>
</body></html>`;

const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
    if(pathname==='/js/workspace-focus-visible-v278.js')return route.fulfill({contentType:'application/javascript',path:'public/js/workspace-focus-visible-v278.js'});
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://localhost/');
  await page.waitForFunction(()=>document.documentElement.dataset.workspaceFocusVisible==='20261004-workspace-focus-visible-v278');

  const expected=['workspaceButton','workspaceLink','thebeAiDockPill','dockButton'];
  for(const id of expected){
    await page.keyboard.press('Tab');
    const state=await page.evaluate(expectedId=>{
      const active=document.activeElement;
      const css=getComputedStyle(active);
      return {id:active?.id||'',focusVisible:active?.matches?.(':focus-visible')||false,outlineStyle:css.outlineStyle,outlineWidth:parseFloat(css.outlineWidth)||0,outlineOffset:parseFloat(css.outlineOffset)||0,boxShadow:css.boxShadow};
    },id);
    assert.equal(state.id,id,`Tab order must reach ${id}: ${JSON.stringify(state)}`);
    assert.equal(state.focusVisible,true,`${id} must match :focus-visible after keyboard navigation`);
    assert.equal(state.outlineStyle,'solid',`${id} must show a solid keyboard focus outline`);
    assert(state.outlineWidth>=3,`${id} focus outline must be at least 3px: ${JSON.stringify(state)}`);
    assert(state.outlineOffset>=2,`${id} focus outline must be offset from the control: ${JSON.stringify(state)}`);
    assert.notEqual(state.boxShadow,'none',`${id} must retain the high-contrast outer focus ring`);
  }

  await page.locator('#workspaceButton').click();
  const mouseState=await page.evaluate(()=>({id:document.activeElement?.id||'',focusVisible:document.activeElement?.matches?.(':focus-visible')||false}));
  assert.equal(mouseState.id,'workspaceButton');
  assert.equal(mouseState.focusVisible,false,'mouse click focus must not be forced into the keyboard-only focus treatment');
  assert.deepEqual(errors,[],'focus-visible guard must not throw browser errors');
  console.log('V278_WORKSPACE_FOCUS_VISIBLE_BROWSER_PASS: keyboard Tab focus is visible across workspace and Thebe controls while mouse focus remains modality-aware');
}finally{await browser.close()}
