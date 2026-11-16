import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const adapter=fs.readFileSync(new URL('../public/js/thebe-life-workspace-adapter.js',import.meta.url),'utf8');
const preview=fs.readFileSync(new URL('../public/js/thebe-life-workspace-preview.js',import.meta.url),'utf8');
test('private-beta integration parses and remains explicitly disabled unless host opts in',()=>{
  assert.doesNotThrow(()=>new vm.Script(adapter));
  assert.doesNotThrow(()=>new vm.Script(preview));
  assert.match(adapter,/privateBeta\?\.syntheticOnly===true/);
  assert.match(adapter,/authorization\.serverVerified\s*!==\s*true/);
  assert.match(adapter,/lifeEntitled\s*!==\s*true/);
  assert.match(preview,/if\(privateBeta\)/);
  assert.match(preview,/refresh\.addEventListener\('click'/);
  assert.doesNotMatch(preview,/\bfetch\s*\(/);
});
test('adapter excludes unverified beta context, including invalid groups',()=>{
  class Element{
    constructor(shell){this.shell=shell;this.isConnected=true;}
    closest(query){return query==='#appShell'?this.shell:null;}
  }
  const shell={contains:node=>node.shell===shell};
  let lastOptions=null;
  const win={ThebeLifeWorkspacePreview:{mount(_root,opts){lastOptions=opts;return {destroy(){}};}}};
  vm.runInNewContext(adapter,{window:win,Element});
  const outlet=new Element(shell);
  const authorization={signedIn:true,lifeEntitled:true,serverVerified:true};
  const mount=privateBeta=>win.ThebeLifeWorkspaceAdapter.mountAuthorized({outlet,authorization,privateBeta});
  assert.equal(mount({enabled:true,groupId:'g1',syntheticOnly:false}).mounted,true);
  assert.equal(lastOptions.privateBeta,null);
  win.ThebeLifeWorkspaceAdapter.unmount(outlet);
  assert.equal(mount({enabled:true,groupId:'../../cross',syntheticOnly:true}).mounted,true);
  assert.equal(lastOptions.privateBeta,null);
  win.ThebeLifeWorkspaceAdapter.unmount(outlet);
  assert.equal(mount({enabled:true,groupId:'g1',syntheticOnly:true}).mounted,true);
  assert.equal(lastOptions.privateBeta.groupId,'g1');
  assert.equal(lastOptions.privateBeta.enabled,true);
});
test('preview aborts in-flight reads on unmount and never labels cleared ledger as bank proof',()=>{
  assert.match(preview,/activeRead\?\.abort\(\)/);
  assert.match(preview,/if\(!alive\|\|activeRead!==abort\)return/);
  assert.match(preview,/NOT independently verified bank funds/);
  assert.match(preview,/staging ledger figures/);
  assert.doesNotMatch(preview,/paymentExecutionEnabled\s*=\s*true/);
});
