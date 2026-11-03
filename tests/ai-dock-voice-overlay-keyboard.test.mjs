import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
test('voice keyboard trap skips hidden action buttons',()=>{
 const first=source.indexOf('      voiceScreen.addEventListener("keydown",event=>{');
 const end=source.indexOf('      document.body.append(voiceScreen);',first);
 assert.ok(first>=0&&end>first);
 const code=source.slice(first,end);
 let handler;
 let current;
 const visible={getClientRects:()=>[{}],closest:()=>null,focus(){current=this}};
 const hidden={getClientRects:()=>[{}],closest:()=>({hidden:true}),focus(){throw Error('hidden control focused')}};
 const voiceScreen={addEventListener(type,fn){assert.equal(type,'keydown');handler=fn},
  querySelectorAll(){return [visible,hidden]}};
 vm.runInNewContext(code,{voiceScreen,document:{get activeElement(){return current}}});
 current=visible;
 let prevented=false;
 handler({key:'Tab',shiftKey:false,preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.equal(current,visible);
});
test('voice overlay resets options on reopening, without resetting chat or draft',()=>{
 const start=source.indexOf('    if(!voiceScreen.open){',source.indexOf('  function openVoiceScreen(){'));
 const end=source.indexOf('  function closeVoiceScreen(',start);
 assert.ok(start>=0&&end>start);
 const code=source.slice(start,end);
 assert.match(code,/miniControls\.hidden=true/);
 assert.match(code,/optionsToggle\.setAttribute\("aria-expanded","false"\)/);
 assert.match(code,/voiceScreen\.show\(\)/);
 assert.doesNotMatch(code,/(?:input\.value\s*=|clearConversation\(|lastAnswer\s*=|pendingFiles\s*=)/);
});
test('voice stop and cancellation still honor the established session boundary',()=>{
 assert.match(source,/exit\.addEventListener\("click",\(\)=>closeVoiceScreen\(true\)\)/);
 assert.match(source,/voiceScreen\.addEventListener\("cancel",event=>\{event\.preventDefault\(\);closeVoiceScreen\(true\)\}/);
 assert.match(source,/if\(stopSession\)global\.ThebeLiveVoice\?\.stop\?\.\(\)/);
});
