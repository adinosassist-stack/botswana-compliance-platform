from pathlib import Path

wrapper_path=Path('scripts/production-synthetic-full-user-wrapper.mjs')
wrapper=wrapper_path.read_text(encoding='utf-8')
old="""      const expanded=dock.dataset.expanded==='true'||document.body?.classList.contains('thebe-ai-expanded');
      const expectedWidth=window.innerWidth>=1200
        ?(expanded?560:Math.round(Math.max(360,Math.min(420,window.innerWidth*0.28))))
        :window.innerWidth>=1024
          ?(expanded?460:Math.round(Math.max(332,Math.min(360,window.innerWidth*0.31))))
          :0;"""
new="""      const expanded=dock.dataset.geminiNarrowExpanded==='1';
      const viewportWidth=Number(globalThis.innerWidth)||0;
      const expectedWidth=viewportWidth>=1200
        ?(expanded?560:Math.round(Math.max(360,Math.min(420,viewportWidth*0.28))))
        :viewportWidth>=1024
          ?(expanded?460:Math.round(Math.max(332,Math.min(360,viewportWidth*0.31))))
          :0;"""
assert wrapper.count(old)==1, f'expected one viewport geometry block, found {wrapper.count(old)}'
wrapper_path.write_text(wrapper.replace(old,new,1),encoding='utf-8')

phase_path=Path('tests/v82-phase0-launch-audit-deferred-integrations.mjs')
phase=phase_path.read_text(encoding='utf-8')
old_wide="Math.round(Math.max(360,Math.min(420,window.innerWidth*0.28)))"
old_mid="Math.round(Math.max(332,Math.min(360,window.innerWidth*0.31)))"
assert phase.count(old_wide)==1, f'expected one old wide Phase 0 formula, found {phase.count(old_wide)}'
assert phase.count(old_mid)==1, f'expected one old medium Phase 0 formula, found {phase.count(old_mid)}'
phase=phase.replace(old_wide,"Math.round(Math.max(360,Math.min(420,viewportWidth*0.28)))",1)
phase=phase.replace(old_mid,"Math.round(Math.max(332,Math.min(360,viewportWidth*0.31)))",1)
phase_path.write_text(phase,encoding='utf-8')

v269_path=Path('tests/v269-live-dock-geometry.mjs')
v269=v269_path.read_text(encoding='utf-8')
old_v269="""function passes({width=272,expected=272,height=610,hidden=false,display='block',visibility='visible',surface='public',pillHidden=true,pillDisplay='none'}={}){
 const body={},dock={hidden,dataset:{surface},getBoundingClientRect:()=>({width,height})},pill={hidden:pillHidden};
 return vm.runInNewContext(predicate,{document:{body,getElementById:id=>id==='thebeAiDock'?dock:id==='thebeAiDockPill'?pill:null},getComputedStyle:n=>n===body?{getPropertyValue:()=>String(expected)}:n===dock?{display,visibility}:{display:pillDisplay}});
}
assert.equal(passes(),true,'live compact 272px dock must pass');
assert.equal(passes({width:344,expected:344}),true,'configured expanded width must pass');
assert.equal(passes({width:304}),false,'stale larger dock must fail');
assert.equal(passes({width:250}),false,'incorrect narrower dock must fail');
for(const options of [{expected:0},{hidden:true},{display:'none'},{visibility:'hidden'},{height:0},{surface:'workspace'},{pillHidden:false},{pillDisplay:'block'}])assert.equal(passes(options),false,JSON.stringify(options));
console.log('PASS: live audit respects configured dock width and retains visibility, surface, height and pill checks');"""
new_v269="""function passes({viewportWidth=1440,width=403,height=610,hidden=false,display='block',visibility='visible',surface='public',pillHidden=true,pillDisplay='none',gemini='1',expanded=false}={}){
 const body={},dock={hidden,dataset:{surface,geminiNarrowV274:gemini,geminiNarrowExpanded:expanded?'1':'0'},getBoundingClientRect:()=>({width,height})},pill={hidden:pillHidden};
 return vm.runInNewContext(predicate,{innerWidth:viewportWidth,document:{body,getElementById:id=>id==='thebeAiDock'?dock:id==='thebeAiDockPill'?pill:null},getComputedStyle:n=>n===dock?{display,visibility}:{display:pillDisplay}});
}
assert.equal(passes(),true,'wide desktop compact Gemini dock must match 28vw clamped geometry');
assert.equal(passes({viewportWidth:1280,width:360}),true,'wide desktop compact minimum must pass');
assert.equal(passes({viewportWidth:1100,width:341}),true,'medium desktop compact 31vw geometry must pass');
assert.equal(passes({expanded:true,width:560}),true,'wide desktop expanded width must pass');
assert.equal(passes({viewportWidth:1100,expanded:true,width:460}),true,'medium desktop expanded width must pass');
assert.equal(passes({width:272}),false,'obsolete spatial width must fail');
assert.equal(passes({width:420}),false,'incorrect wide desktop compact width must fail');
for(const options of [{gemini:'0'},{hidden:true},{display:'none'},{visibility:'hidden'},{height:0},{surface:'workspace'},{pillHidden:false},{pillDisplay:'block'}])assert.equal(passes(options),false,JSON.stringify(options));
console.log('PASS: live audit respects authoritative adjustable Gemini dock geometry and retains visibility, surface, runtime marker, height and pill checks');"""
assert v269.count(old_v269)==1, f'expected one legacy v269 geometry harness, found {v269.count(old_v269)}'
v269_path.write_text(v269.replace(old_v269,new_v269,1),encoding='utf-8')
