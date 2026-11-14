import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/thebe-dock-recovery-geometry-v269.js',import.meta.url),'utf8');
test('dock movement clears drag state on up, cancel and lost pointer capture',()=>{
 for(const event of ['pointerup','pointercancel','lostpointercapture'])
  assert.ok(source.includes('title.addEventListener("'+event+'",finish)'),'missing '+event+' cleanup');
 assert.match(source,/const finish=\(\)=>\{if\(!drag\)return;drag=null;/);
});
test('dock resize clears drag state on lost pointer capture',()=>{
 assert.match(source,/handle\.addEventListener\("lostpointercapture",stopDrag\)/);
});
