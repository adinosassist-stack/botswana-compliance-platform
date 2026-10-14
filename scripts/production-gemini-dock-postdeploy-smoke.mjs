import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ORIGIN=String(process.env.ORIGIN||'https://thebedesk.com').replace(/\/$/,'');
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
assert.ok(executablePath,'no Chromium-compatible browser found');

const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const pageErrors=[];
  const criticalFailures=[];
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
  page.on('requestfailed',request=>{
    const url=request.url();
    if(url.startsWith(ORIGIN+'/js/')||url.startsWith(ORIGIN+'/assets/')){
      criticalFailures.push(`${request.method()} ${url} ${request.failure()?.errorText||''}`);
    }
  });

  const root=await page.goto(`${ORIGIN}/?gemini-dock-smoke=${Date.now()}`,{waitUntil:'networkidle',timeout:45000});
  assert.equal(root?.status(),200,'public root must return HTTP 200');
  const dock=page.locator('#thebeAiDock[data-surface="public"]').first();
  await dock.waitFor({state:'visible',timeout:15000});
  await page.waitForTimeout(500);

  async function contract(){
    return page.evaluate(()=>{
      const dock=document.querySelector('#thebeAiDock[data-surface="public"]');
      const gate=document.getElementById('marketingGate');
      const composer=dock?.querySelector('.thebe-ai-compose');
      const textarea=composer?.querySelector('textarea');
      const send=dock?.querySelector('.thebe-ai-send');
      const icon=dock?.querySelector('.thebe-ai-dock-head .thebe-ai-icon-btn');
      const response=dock?.querySelector('.thebe-ai-response');
      const dockRect=dock?.getBoundingClientRect();
      const composerRect=composer?.getBoundingClientRect();
      const sendRect=send?.getBoundingClientRect();
      const iconRect=icon?.getBoundingClientRect();
      const style=node=>node?getComputedStyle(node):null;
      const hidden=selector=>{
        const node=dock?.querySelector(selector);
        return !node||style(node)?.display==='none';
      };
      return {
        viewportWidth:innerWidth,
        viewportHeight:innerHeight,
        width:dockRect?.width||0,
        height:dockRect?.height||0,
        top:dockRect?.top||0,
        right:innerWidth-(dockRect?.right||0),
        bottom:innerHeight-(dockRect?.bottom||0),
        radius:parseFloat(style(dock)?.borderTopLeftRadius||'0'),
        background:style(dock)?.backgroundColor||'',
        gatePaddingRight:parseFloat(style(gate)?.paddingRight||'0'),
        quickHidden:hidden('.thebe-ai-quick'),
        voiceHidden:hidden('.thebe-ai-voice-card'),
        publicActionsHidden:hidden('.thebe-ai-public-actions'),
        contextHidden:hidden('.thebe-ai-context-bar'),
        modeHidden:hidden('.thebe-ai-mode-rail'),
        presenceHidden:hidden('.thebe-ai-presence'),
        responseBackground:style(response)?.backgroundColor||'',
        responseBorderTop:style(response)?.borderTopWidth||'',
        composerVisible:!!composerRect&&composerRect.width>0&&composerRect.height>0,
        composerRadius:parseFloat(style(composer)?.borderTopLeftRadius||'0'),
        composerBackground:style(composer)?.backgroundColor||'',
        composerBottomGap:dockRect&&composerRect?dockRect.bottom-composerRect.bottom:null,
        sendWidth:sendRect?.width||0,
        sendHeight:sendRect?.height||0,
        sendRadius:parseFloat(style(send)?.borderTopLeftRadius||'0'),
        iconWidth:iconRect?.width||0,
        iconHeight:iconRect?.height||0,
        iconRadius:parseFloat(style(icon)?.borderTopLeftRadius||'0'),
        textareaVisible:!!textarea&&style(textarea)?.display!=='none'&&textarea.getBoundingClientRect().height>0,
        dockRelease:dock?.dataset.geminiNarrowRelease||''
      };
    });
  }

  const desktop=await contract();
  assert.ok(desktop.width>=360&&desktop.width<=420,`dock width must stay in Gemini narrow rail range: ${JSON.stringify(desktop)}`);
  assert.ok(desktop.width/desktop.viewportWidth<0.30,`dock must remain under 30% of desktop viewport: ${JSON.stringify(desktop)}`);
  assert.ok(Math.abs(desktop.top-16)<=2,`dock top edge must remain 16px: ${JSON.stringify(desktop)}`);
  assert.ok(Math.abs(desktop.right-16)<=2,`dock right edge must remain 16px: ${JSON.stringify(desktop)}`);
  assert.ok(Math.abs(desktop.bottom-16)<=2,`dock bottom edge must remain 16px: ${JSON.stringify(desktop)}`);
  assert.ok(desktop.height>=desktop.viewportHeight-36,`dock must run nearly full viewport height: ${JSON.stringify(desktop)}`);
  assert.ok(desktop.radius>=22&&desktop.radius<=26,`dock radius must remain restrained: ${JSON.stringify(desktop)}`);
  assert.equal(desktop.background,'rgb(25, 25, 25)','dock must keep the flat dark Gemini/Thebe canvas');
  assert.ok(desktop.gatePaddingRight>=desktop.width+30,`market lane must reserve space for the dock: ${JSON.stringify(desktop)}`);
  assert.equal(desktop.quickHidden,true,'public suggestion chips must stay hidden');
  assert.equal(desktop.voiceHidden,true,'large public voice card must stay hidden');
  assert.equal(desktop.publicActionsHidden,true,'extra public CTA row must stay hidden');
  assert.equal(desktop.contextHidden,true,'public context chrome must stay hidden');
  assert.equal(desktop.modeHidden,true,'public mode rail must stay hidden');
  assert.equal(desktop.presenceHidden,true,'public presence chrome must stay hidden');
  assert.ok(desktop.responseBackground==='rgba(0, 0, 0, 0)'||desktop.responseBackground==='transparent','conversation output must stay flat, not a separate card');
  assert.ok(desktop.responseBorderTop==='0px'||desktop.responseBorderTop==='','conversation output must not have a card border');
  assert.equal(desktop.composerVisible,true,'single bottom composer must be visible');
  assert.ok(desktop.composerRadius>=26&&desktop.composerRadius<=30,`composer must retain the rounded Gemini input treatment: ${JSON.stringify(desktop)}`);
  assert.equal(desktop.composerBackground,'rgb(36, 36, 36)','composer must remain a quiet distinct surface');
  assert.ok(desktop.composerBottomGap!==null&&desktop.composerBottomGap>=15&&desktop.composerBottomGap<=22,`composer must sit at the bottom of the rail: ${JSON.stringify(desktop)}`);
  assert.ok(Math.abs(desktop.sendWidth-42)<=2&&Math.abs(desktop.sendHeight-42)<=2,`send control must stay compact: ${JSON.stringify(desktop)}`);
  assert.ok(desktop.sendRadius>=20,'send control must remain circular');
  assert.ok(Math.abs(desktop.iconWidth-36)<=2&&Math.abs(desktop.iconHeight-36)<=2,`header control must stay compact: ${JSON.stringify(desktop)}`);
  assert.ok(desktop.iconRadius>=17,'header control must remain circular');
  assert.equal(desktop.textareaVisible,true,'composer textarea must be visible');
  assert.match(desktop.dockRelease,/gemini-parity-v275/,'runtime-owned Gemini geometry must be active');

  const textarea=page.locator('#thebeAiDock[data-surface="public"] .thebe-ai-compose textarea').first();
  await textarea.fill('Gemini dock live smoke — do not submit');
  await textarea.focus();
  assert.equal(await textarea.inputValue(),'Gemini dock live smoke — do not submit','composer input must accept text');
  assert.equal(await textarea.evaluate(node=>document.activeElement===node),true,'composer input must accept focus');
  assert.ok(await page.locator('#thebeAiDock[data-surface="public"] .thebe-ai-send').count(),'send control must exist after typing');

  await page.setViewportSize({width:1100,height:900});
  await page.waitForTimeout(300);
  const medium=await contract();
  assert.ok(medium.width>=332&&medium.width<=360,`medium desktop dock must stay narrow: ${JSON.stringify(medium)}`);
  assert.ok(Math.abs(medium.top-12)<=2&&Math.abs(medium.right-12)<=2&&Math.abs(medium.bottom-12)<=2,`medium desktop dock must use 12px edges: ${JSON.stringify(medium)}`);
  assert.ok(medium.gatePaddingRight>=medium.width+22,`medium desktop market lane must remain reserved: ${JSON.stringify(medium)}`);

  await page.setViewportSize({width:1440,height:1000});
  await page.waitForTimeout(300);
  await page.evaluate(()=>document.getElementById('thebeAiDock')?.setAttribute('aria-hidden','true'));
  await page.waitForTimeout(250);
  const releasedPadding=await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight||'0'));
  assert.ok(releasedPadding<=1,`hiding the dock must immediately release the market lane; padding=${releasedPadding}`);
  await page.evaluate(()=>document.getElementById('thebeAiDock')?.setAttribute('aria-hidden','false'));
  await page.waitForTimeout(250);
  const restored=await contract();
  assert.ok(restored.gatePaddingRight>=restored.width+30,'showing the dock must restore its non-overlapping market lane');

  assert.deepEqual(pageErrors,[],'Gemini dock live smoke must not raise browser errors');
  assert.deepEqual(criticalFailures,[],'Gemini dock live smoke must not have critical asset failures');
  console.log(`GEMINI_DOCK_POSTDEPLOY_PASS desktop=${Math.round(desktop.width)}px medium=${Math.round(medium.width)}px composer=ready lane=responsive`);
}finally{
  await browser.close();
}
