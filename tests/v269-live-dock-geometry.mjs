import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('scripts/production-synthetic-full-user-wrapper.mjs','utf8');
const marker="const dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');";
const start=source.indexOf(marker),end=source.indexOf('},null,{timeout:15000});',start);
assert(start>=0&&end>start,'production public dock predicate must exist');
const predicate='(()=>{'+source.slice(start,end)+'})()';
function passes({viewportWidth=1440,width=403,height=610,hidden=false,display='block',visibility='visible',surface='public',pillHidden=true,pillDisplay='none',gemini='1',expanded=false}={}){
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
console.log('PASS: live audit respects authoritative adjustable Gemini dock geometry and retains visibility, surface, runtime marker, height and pill checks');
