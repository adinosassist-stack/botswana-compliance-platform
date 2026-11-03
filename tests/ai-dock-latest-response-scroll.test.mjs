import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const start=source.indexOf('  function syncLatestResponseButton(){');
const end=source.indexOf('  function scrollResponseIntoView(',start);
assert.ok(start>=0&&end>start,'follow-state helpers must exist');
const helpers=source.slice(start,end);
function harness(){
 let autoFollowResponse=true,responseScrollLock=false;
 const latestResponseButton={hidden:true};
 const dock={hidden:false};
 const scrollRegion={scrollHeight:1800,scrollTop:1300,clientHeight:400};
 const vmContext=vm.createContext({latestResponseButton,dock,scrollRegion});
 const methods=vm.runInContext('(function(){let autoFollowResponse=true,responseScrollLock=false;'+helpers+';return {syncResponseFollowState,setLocked:value=>{responseScrollLock=value}}})()',vmContext);
 return {methods,latestResponseButton,dock,scrollRegion};
}
test('scrolling away from latest response immediately shows shortcut',()=>{
 const h=harness();h.scrollRegion.scrollTop=100;
 h.methods.syncResponseFollowState();
 assert.equal(h.latestResponseButton.hidden,false);
});
test('returning near latest response hides shortcut',()=>{
 const h=harness();h.scrollRegion.scrollTop=100;h.methods.syncResponseFollowState();
 h.scrollRegion.scrollTop=1380;h.methods.syncResponseFollowState();
 assert.equal(h.latestResponseButton.hidden,true);
});
test('hidden dock does not display latest shortcut',()=>{
 const h=harness();h.scrollRegion.scrollTop=0;h.dock.hidden=true;h.methods.syncResponseFollowState();
 assert.equal(h.latestResponseButton.hidden,true);
});
test('programmatic scrolling lock avoids transient shortcut flicker',()=>{
 const h=harness();h.methods.setLocked(true);h.scrollRegion.scrollTop=0;h.methods.syncResponseFollowState();
 assert.equal(h.latestResponseButton.hidden,true);
});
test('existing dock scrolling listener remains passive and no conversation mutation is added',()=>{
 assert.match(source,/scrollRegion\.addEventListener\("scroll",syncResponseFollowState,\{passive:true\}\)/);
 assert.match(helpers,/syncLatestResponseButton\(\)/);
 assert.doesNotMatch(helpers,/(?:clearConversation\(|lastAnswer\s*=|input\.value\s*=|pendingFiles\s*=)/);
});
