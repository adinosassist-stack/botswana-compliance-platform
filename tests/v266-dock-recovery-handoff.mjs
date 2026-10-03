import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {injectOwnerCommandCentreAssets,injectPublicThebeAssets} from '../cloudflare/src/production-entry.js';

const runtime=fs.readFileSync(process.env.THEBE_RECOVERY_SOURCE||'public/js/thebe-live-voice.js','utf8');
const start=runtime.indexOf('  const dockRecoveryStyles=new Map();');
assert(start>=0,'emergency styles must retain declaration ownership');
const end=runtime.indexOf('  function workspaceDockLeftPx()',start);
const context=vm.createContext({});
vm.runInContext(runtime.slice(start,end)+';globalThis.apply=setCriticalStyle;globalThis.release=releaseDockRecoveryStyles;',context);
function node(){
  const declarations=new Map();
  return {style:{
    getPropertyValue:key=>declarations.get(key)?.value||'',
    getPropertyPriority:key=>declarations.get(key)?.priority||'',
    setProperty:(key,value,priority='')=>declarations.set(key,{value,priority}),
    removeProperty:key=>declarations.delete(key)
  }};
}
const dock=node(),child=node();
dock.style.setProperty('background','original','');
dock.style.setProperty('--thebe-keyboard-inset','120px');
context.apply(dock,{width:'420px',background:'emergency'});
context.apply(child,{'grid-template-columns':'82px minmax(0,1fr)'});
context.apply(dock,{width:'560px',background:'emergency'});
assert.equal(dock.style.getPropertyValue('width'),'560px');
context.release();
assert.equal(dock.style.getPropertyValue('width'),'','late CSS regains width ownership');
assert.equal(dock.style.getPropertyValue('background'),'original','restore pre-existing inline declaration');
assert.equal(dock.style.getPropertyPriority('background'),'');
assert.equal(dock.style.getPropertyValue('--thebe-keyboard-inset'),'120px','keyboard state is preserved');
assert.equal(child.style.getPropertyValue('grid-template-columns'),'','descendant layout also returns to CSS');
context.apply(dock,{width:'420px'});
dock.style.setProperty('width','304px','important');
context.release();
assert.equal(dock.style.getPropertyValue('width'),'304px','later independent presentation updates must survive');
context.release();
context.apply(dock,{width:'560px'});context.release();
assert.equal(dock.style.getPropertyValue('width'),'304px','subsequent recovery starts with a fresh baseline');
const recovery=runtime.slice(runtime.indexOf('  function recoverDockPresentation()'),runtime.indexOf('  function shellVisible()'));
assert.match(recovery,/trim\(\)==="1"\)\{releaseDockRecoveryStyles\(\);/,'late stylesheet triggers ownership release');
const invariants=runtime.slice(runtime.indexOf('  function syncWorkspaceVisualInvariants()'),runtime.indexOf('  function syncVisibility()'));
assert(invariants.indexOf('releaseDockRecoveryStyles()')<invariants.indexOf('clearRoutineWorkspaceInlineGeometry()'),'release before legacy cleanup can erase recovery declarations');
for(const inject of [injectOwnerCommandCentreAssets,injectPublicThebeAssets]){
  const output=inject('<html><head></head><body></body></html>');
  assert.match(output,/thebe-live-voice\.js\?v=20261002-pricing-voice-continuity-v247-dock-recovery-v266/,'both surfaces serve the repaired runtime under a new cache identity');
}
console.log('PASS: temporary recovery ownership, repeated recovery, child layout, original declarations, independent changes and both production cache paths');
