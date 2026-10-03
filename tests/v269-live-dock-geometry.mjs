import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('scripts/production-synthetic-full-user-wrapper.mjs','utf8');
const marker="const dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');";
const start=source.indexOf(marker),end=source.indexOf('},null,{timeout:15000});',start);
assert(start>=0&&end>start,'production public dock predicate must exist');
const predicate='(()=>{'+source.slice(start,end)+'})()';
function passes({width=272,expected=272,height=610,hidden=false,display='block',visibility='visible',surface='public',pillHidden=true,pillDisplay='none'}={}){
 const body={},dock={hidden,dataset:{surface},getBoundingClientRect:()=>({width,height})},pill={hidden:pillHidden};
 return vm.runInNewContext(predicate,{document:{body,getElementById:id=>id==='thebeAiDock'?dock:id==='thebeAiDockPill'?pill:null},getComputedStyle:n=>n===body?{getPropertyValue:()=>String(expected)}:n===dock?{display,visibility}:{display:pillDisplay}});
}
assert.equal(passes(),true,'live compact 272px dock must pass');
assert.equal(passes({width:344,expected:344}),true,'configured expanded width must pass');
assert.equal(passes({width:304}),false,'stale larger dock must fail');
assert.equal(passes({width:250}),false,'incorrect narrower dock must fail');
for(const options of [{expected:0},{hidden:true},{display:'none'},{visibility:'hidden'},{height:0},{surface:'workspace'},{pillHidden:false},{pillDisplay:'block'}])assert.equal(passes(options),false,JSON.stringify(options));
console.log('PASS: live audit respects configured dock width and retains visibility, surface, height and pill checks');
