import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const runtime=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
const slice=(start,end)=>runtime.slice(runtime.indexOf(start),runtime.indexOf(end,runtime.indexOf(start)));
const moneySource=slice('async function renderMoneyHub(){','function propertyNumber(');
for(const enhanced of [true,false]){
  const reads=[],refreshes=[];
  const context=vm.createContext({
    roleCanView:()=>true,currentWorkspaceRole:()=> 'owner',
    document:{getElementById:id=>id==='moneyWorkspaceV307'?(enhanced?{}:null):{textContent:''}},
    ThebeMoneyWorkspaceV307:{refresh:async options=>refreshes.push(options)},
    apiJson:async path=>{reads.push(path);return {}},homeMoneyMinor:()=> 'P0'
  });
  vm.runInContext(moneySource,context);
  await context.renderMoneyHub();
  assert.equal(reads.length,enhanced?0:1,'mounted Money must not start a redundant legacy finance request');
  assert.equal(refreshes.length,enhanced?1:0);
  if(enhanced)assert.equal(refreshes[0].force,false,'navigation must respect the finance freshness window');
}
const workSource=slice('function renderWorkspaceInfographic(','async function renderTenderHub(){');
for(const role of ['owner','manager','reviewer','auditor']){
  let release;
  const slow=new Promise(resolve=>{release=resolve}),panels=[];
  const context=vm.createContext({
    roleCanView:()=>true,currentWorkspaceRole:()=>role,
    escapeHtml:value=>String(value),
    document:{getElementById:()=>({textContent:''}),querySelectorAll:()=>[]},
    apiJson:async path=>path==='/api/obligations'?slow:{items:[],obligations:[]},
    renderManagementReviewInbox:async()=>{panels.push('inbox')},
    renderManagementReReview:async()=>{panels.push('re-review')},
    renderManagementReviewAudit:async()=>{panels.push('audit')}
  });
  vm.runInContext(workSource,context);
  const finished=context.renderWorkHub();
  assert.deepEqual(panels,role==='auditor'?['audit']:['inbox','re-review','audit'],'independent review panels must start without waiting for a slow summary and retain role restrictions');
  release({items:[]});await finished;
}
console.log('PASS: Money avoids legacy duplicate reads; Work review panels load independently with role gates');
