import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
test('composer adjusts its height limit for desktop and mobile without resetting the draft',()=>{
 const start=source.indexOf('  function syncComposerHeight(){'),end=source.indexOf('  function renderAttachmentTray(){',start);
 assert.ok(start>=0&&end>start);
 const code=source.slice(start,end);
 let mobile=false;
 const input={value:'Keep this draft intact',scrollHeight:130,style:{}};
 const render=vm.runInNewContext(code+';syncComposerHeight',{input,mobileDockMode:()=>mobile});
 render();
 assert.equal(input.style.height,'112px');
 assert.equal(input.style.overflowY,'auto');
 mobile=true;render();
 assert.equal(input.style.height,'96px');
 assert.equal(input.value,'Keep this draft intact');
});
test('keyboard and viewport changes resync composer without clearing chat or user input',()=>{
 const start=source.indexOf('    const syncKeyboard=()=>{'),end=source.indexOf('    global.visualViewport?.addEventListener("resize",syncKeyboard',start);
 assert.ok(start>=0&&end>start);
 const section=source.slice(start,end);
 assert.match(section,/syncComposerHeight\(\)/);
 assert.match(source,/global\.addEventListener\("resize",\(\)=>\{syncVisibility\(\);syncKeyboard\(\)\}/);
 assert.match(source,/global\.visualViewport\?\.addEventListener\("scroll",syncKeyboard/);
 assert.doesNotMatch(section,/(?:input\.value\s*=|clearConversation\(|lastAnswer\s*=|pendingFiles\s*=)/);
});
