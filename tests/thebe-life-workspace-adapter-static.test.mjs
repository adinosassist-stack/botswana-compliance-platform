import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/js/thebe-life-workspace-adapter.js',import.meta.url),'utf8');
test('adapter is syntactically valid, gated, and does not install navigation automatically',()=>{
  assert.doesNotThrow(()=>new vm.Script(code));
  assert.match(code,/serverVerified\s*!==\s*true/);
  assert.match(code,/lifeEntitled\s*!==\s*true/);
  assert.match(code,/closest\('#appShell'\)/);
  assert.doesNotMatch(code,/addEventListener\(['"]DOMContentLoaded/);
});
test('adapter refuses unverified or invalid hosts and permits explicit unmount',()=>{
  class Element {
    constructor({connected=true,shell=null}={}){this.isConnected=connected;this.shell=shell;}
    closest(query){if(query==='#appShell')return this.shell;return null;}
  }
  const shell={contains:x=>x.shell===shell};
  const win={};
  vm.runInNewContext(code,{window:win,Element});
  const outlet=new Element({shell});
  const a=win.ThebeLifeWorkspaceAdapter;
  assert.equal(a.mountAuthorized({outlet}).reason,'life_access_not_verified');
  assert.equal(a.mountAuthorized({outlet,authorization:{signedIn:true,lifeEntitled:true,serverVerified:true}}).reason,'life_component_missing');
  let destroyed=0,mounts=0;
  win.ThebeLifeWorkspacePreview={mount:()=>{mounts++;return {destroy(){destroyed++;}};}};
  const authorization={signedIn:true,lifeEntitled:true,serverVerified:true};
  assert.equal(a.mountAuthorized({outlet,authorization}).mounted,true);
  assert.equal(a.mountAuthorized({outlet,authorization}).reason,'already_mounted');
  assert.equal(mounts,1);
  assert.equal(a.unmount(outlet),true);
  assert.equal(destroyed,1);
  assert.equal(a.unmount(outlet),false);
  assert.equal(a.mountAuthorized({outlet,authorization,source:'market'}).mounted,false);
});
