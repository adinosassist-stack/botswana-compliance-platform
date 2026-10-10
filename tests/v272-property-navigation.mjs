import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(process.env.PROPERTY_SOURCE||'public/js/property-visibility-v230.js','utf8');
const nav=source.match(/nav\.append\((.+)\);/)?.[1];
assert(nav,'primary navigation exists');
assert.deepEqual([...nav.matchAll(/compactButton\("([^"]+)",/g)].map(x=>x[1]),['Today','Properties','Analyse','Operations']);
const start=source.indexOf('  function setPropertyPane('),end=source.indexOf('  function compactButton(',start);
const buttons=['today','properties','analyse','operations'].map(pane=>({dataset:{propertyPaneButton:pane},classList:{toggle(){}},setAttribute(key,value){this[key]=value}}));
let cleared=0;
const view={dataset:{},querySelector:()=>({style:{removeProperty(){cleared++}}}),querySelectorAll:()=>buttons};
const ctx=vm.createContext({document:{getElementById:()=>view},PROPERTY_PANES:new Set(['today','properties','analyse','operations','compare','optimise']),paneTarget:()=>null});
vm.runInContext(source.slice(start,end),ctx);
for(const pane of ['analyse','compare','optimise','today']){
 vm.runInContext(`setPropertyPane("${pane}")`,ctx);
 assert.equal(view.dataset.propertyActivePane,pane);
 assert.equal(buttons.find(b=>b['aria-selected']==='true').dataset.propertyPaneButton,['compare','optimise'].includes(pane)?'analyse':pane);
}
assert.equal(cleared,3,'leaving Analyse clears stale inline display recovery without reintroducing a visibility repair pass');
assert.doesNotMatch(source,/function ensurePropertyVisible\(/,'Property navigation must not depend on the retired visibility-repair state machine');
assert.doesNotMatch(source,/function repairNode\(/,'Property navigation must not mutate visibility through the retired repair helper');
const fnStart=source.indexOf('  function propertyAssetUrl('),fnEnd=source.indexOf('  function ensureOperationsStyles(',fnStart);
const release='a'.repeat(40);
const urls=vm.createContext({document:{querySelector:()=>({content:release})}});
vm.runInContext(source.slice(fnStart,fnEnd),urls);
assert.equal(vm.runInContext('propertyAssetUrl("/assets/property-operations-v262.css")',urls),'/assets/property-operations-v262.css?release='+release);
console.log('V272_PROPERTY_NAVIGATION_PASS');
