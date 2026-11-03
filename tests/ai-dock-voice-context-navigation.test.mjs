import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const start=source.indexOf('  function syncContextBar(){'),end=source.indexOf('  function setAssistantMode(',start);
assert.ok(start>=0&&end>start);
const body=source.slice(start,end);
test('navigation updates both dock and active voice context without touching conversation',()=>{
 const label={textContent:''},bar={dataset:{}},voiceLabel={textContent:''};
 let context={id:'moneyhub',title:'Money'},surface='workspace';
 const voiceScreen={querySelector:()=>voiceLabel};
 const sync=vm.runInNewContext(body+';syncContextBar',{contextBar:bar,contextLabel:label,activeContext:()=>context,surfaceMode:()=>surface,voiceScreen});
 sync();assert.equal(label.textContent,'Money');assert.equal(bar.dataset.contextId,'moneyhub');assert.equal(voiceLabel.textContent,'Same Thebe AI · Money');
 context={id:'peopleops',title:'People'};sync();
 assert.equal(label.textContent,'People');assert.equal(voiceLabel.textContent,'Same Thebe AI · People');
 surface='public';sync();
 assert.equal(label.textContent,'Public preview');assert.equal(voiceLabel.textContent,'Thebe Desk · public voice sample · no workspace data');
 assert.doesNotMatch(body,/(?:clearConversation\(|input\.value\s*=|lastAnswer\s*=|ThebeLiveVoice\?\.stop\?\.\()/);
});
test('unmounted voice overlay does not affect context synchronization',()=>{
 const label={textContent:''},bar={dataset:{}};
 const sync=vm.runInNewContext(body+';syncContextBar',{contextBar:bar,contextLabel:label,activeContext:()=>({id:'dashboard',title:'Dashboard'}),surfaceMode:()=> 'workspace',voiceScreen:null});
 assert.doesNotThrow(sync);assert.equal(bar.dataset.contextId,'dashboard');
});
test('workspace navigation still runs context refresh through existing lifecycle',()=>{
 assert.match(source,/const syncAfterWorkspaceViewChange=\(\)=>\{/);
 assert.match(source,/syncContextBar\(\)/);
 assert.match(source,/thebe:workspace-view-change/);
});
