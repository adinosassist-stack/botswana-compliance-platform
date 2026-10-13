import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const dock=fs.readFileSync('public/js/thebe-live-voice.js','utf8');
const runtime=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
const authored=fs.readFileSync('public/index.html','utf8');
const owner=fs.readFileSync('public/js/owner-command-centre.js','utf8');
const asset='/assets/workspace-audit-refinements-20261013.css';
const base='<html><head></head><body></body></html>',sha='a'.repeat(40);
assert(!versionReleaseAssets(base,sha).includes(asset),'public/auth must not receive workspace styles');
const release=versionReleaseAssets(base,sha,{includeWorkspaceFixes:true});
assert(release.includes(asset+'?release='+sha));
assert.equal(versionReleaseAssets(release,sha,{includeWorkspaceFixes:true}),release);

// Exercise the public/desktop/mobile boundary rather than treating a regex as proof.
const collapse=vm.createContext({collapsed:true,mobileDockMode:()=>false,surfaceMode:()=> 'workspace',dockShouldYield:()=>false});
vm.runInContext(dock.match(/function effectiveCollapsed\(\)\{[^\n]+/)[0],collapse);
assert.equal(collapse.effectiveCollapsed(),true,'desktop workspace honors compact launcher');
collapse.surfaceMode=()=> 'public';
assert.equal(collapse.effectiveCollapsed(),false,'public desktop retains its reference panel');
collapse.mobileDockMode=()=>true;
assert.equal(collapse.effectiveCollapsed(),true,'mobile remains collapsible');
collapse.collapsed=false;
assert.equal(collapse.effectiveCollapsed(),false,'explicit opening shows the assistant');
collapse.dockShouldYield=()=>true;
assert.equal(collapse.effectiveCollapsed(),true,'protected workflows still yield');

// Use the real command renderer: multiword search must not reveal role-hidden tools.
const results={safeHTML:''};
let allowed=new Set(['aicontrols','employees']);
const search=vm.createContext({
  allowedCommandIds:()=>allowed,
  getCommandSections:()=>[['aicontrols','AI credits & limits','AI','credits cost limits'],['employees','Employees','People','staff register']],
  currentWorkspaceRole:()=> 'owner',canEditEvidence:()=>false,syncCommandModeButtons:()=>{},
  commandResults:results,COMMAND_HUBS:new Set(),commandHeading:()=>'',
  commandActionRow:()=>'',commandRow:row=>row[0]
});
const start=runtime.indexOf('function renderCommandResults(');
vm.runInContext(runtime.slice(start,runtime.indexOf('\nfunction commandKey(',start)),search);
search.renderCommandResults('AI cost');assert.match(results.safeHTML,/aicontrols/);
search.renderCommandResults('staff register');assert.match(results.safeHTML,/employees/);
allowed=new Set(['employees']);search.renderCommandResults('AI cost');
assert.doesNotMatch(results.safeHTML,/aicontrols/,'hidden financial controls remain absent');

// Home opening pre-fills the one dock without spending credits; only submit asks.
let opened=0,asked=0,navigated=0;
const field={value:'',dispatchEvent(){},focus(){}};
const home=vm.createContext({
  window:{ThebeAiDock:{open(){opened++},ask(prompt,mode){assert.equal(prompt,'Explain cash');assert.equal(mode,'ask');asked++}}},
  roleCanView:()=>true,document:{getElementById:()=>null,querySelector:()=>field},
  Event:class {},showView:()=>{navigated++;return true}
});
const homeStart=runtime.indexOf('function openThebeFromHome(');
vm.runInContext(runtime.slice(homeStart,runtime.indexOf('\nfunction askThebeFromHome(',homeStart)),home);
assert.equal(home.openThebeFromHome('Explain cash'),true);assert.equal(asked,0);
assert.equal(field.value,'Explain cash');assert.equal(navigated,0);
home.openThebeFromHome('Explain cash',true);assert.equal(asked,1);assert.equal(opened,2);
home.roleCanView=()=>false;assert.equal(home.openThebeFromHome('Explain cash',true),false);assert.equal(asked,1);
assert(authored.includes(runtime.slice(homeStart,runtime.indexOf('\nfunction askThebeFromHome(',homeStart))),'authored and extracted Home entry points agree');

// Multiple observer notifications schedule one analysis refresh.
let timer=0,cancelled=[],work=new Map(),runs=0;
const scheduling=vm.createContext({scheduledRender:0,clearTimeout:id=>{cancelled.push(id);work.delete(id)},setTimeout:fn=>{work.set(++timer,fn);return timer},renderOwnerBrief:()=>runs++});
const scheduleStart=owner.indexOf('function scheduleRender(');
vm.runInContext(owner.slice(scheduleStart,owner.indexOf('\n  function boot(',scheduleStart)),scheduling);
scheduling.scheduleRender();scheduling.scheduleRender();scheduling.scheduleRender();
assert.equal(work.size,1);[...work.values()][0]();assert.equal(runs,1);
const lazy=vm.createContext({renderSeq:0,createShell:()=>({hidden:true}),canView:()=>true,q:()=>({open:false})});
const briefStart=owner.indexOf('async function renderOwnerBrief(');
vm.runInContext(owner.slice(briefStart,owner.indexOf('\n  function scheduleRender(',briefStart)),lazy);
await lazy.renderOwnerBrief(false); // No transport or model exists: a closed analysis must not call either.
console.log('PASS workspace audit: release isolation, collapse boundary, role-filtered multiword search, shared Home assistant, debounced analysis');
