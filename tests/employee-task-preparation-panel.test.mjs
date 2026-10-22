import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mountEmployeeProposalReviewQueue} from '../public/employee-proposal-review-panel.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({enabled=true,grants=[{delegationId:'d1'}],prepareResult,intercept}={}){
 const elements=[];
 const doc={createElement(tag){const node={tag,children:[],listeners:{},ownerDocument:doc,hidden:false,disabled:false,
  setAttribute(){},append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes},addEventListener(name,fn){this.listeners[name]=fn}};elements.push(node);return node}};
 const container=doc.createElement('main'),calls=[];
 const fetcher=async(path,options={})=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({path,options,body});
  const intercepted=await intercept?.(path,options,body);if(intercepted)return intercepted;
  if(body?.action==='prepare_task')return prepareResult||{ok:true,data:{ok:true,request:{id:'request1',status:'prepared'},execution:{performed:false}}};
  if(path==='/api/agentic/task-execution/status')return {ok:true,data:{schemaReady:true,activeGrants:grants}};
  if(path.includes('view=approved'))return {ok:true,data:{ok:true,taskPreparationEnabled:enabled,proposals:[{proposalKey:'p1',payload:{title:'Review onboarding',employeeId:'e1',dueDate:'2026-11-01'}}],nextCursor:path.includes('after=')?null:'page2'}};
  return {ok:true,data:{ok:true,proposals:[],taskPreparationEnabled:enabled}};
 };
 const dispose=mountEmployeeProposalReviewQueue(container,{fetcher});
 const button=label=>elements.findLast(node=>node.tag==='button'&&node.textContent===label);
 const click=async label=>{const b=button(label);assert.ok(b,`Missing ${label}`);assert.equal(b.hidden,false);assert.equal(b.disabled,false);b.listeners.click();await settle()};
 const status=()=>elements.find(node=>node.tag==='p').textContent;
 return {calls,container,dispose,button,click,status};
}

test('initial People mount makes one pending request and hides unavailable preparation',async()=>{
 const f=fixture({enabled:false});await settle();assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/api/employee-workflow-reviews');assert.equal(f.button('Approved proposals').hidden,true);
});

test('approved UI prepares exact server proposal and grant without approval or execution requests',async()=>{
 const f=fixture();await settle();await f.click('Approved proposals');await f.click('Prepare task for owner review');
 assert.deepEqual(f.calls.filter(call=>call.options.method==='POST').map(call=>call.body),[{action:'prepare_task',proposalKey:'p1',delegationId:'d1'}]);
 assert.match(f.status(),/Separate owner approval is required/);assert.equal(f.button('Prepare task for owner review').disabled,true);
 assert.equal(f.calls.some(call=>/\/(approve|execute|permit)(\/|$)/.test(call.path)),false);
});

test('missing or ambiguous active grants provide guidance and no preparation controls',async()=>{
 for(const grants of [[],[{delegationId:'d1'},{delegationId:'d2'}]]){
  const f=fixture({grants});await settle();await f.click('Approved proposals');
  assert.match(f.status(),/An owner must authorize internal task creation/);assert.equal(f.button('Prepare task for owner review'),undefined);
 }
});

test('a failed grant read keeps approved titles visible and offers refresh',async()=>{
 const f=fixture({intercept:async path=>path.includes('task-execution/status')?{ok:false,status:503}:null});await settle();await f.click('Approved proposals');
 assert.match(f.status(),/Task preparation is unavailable/);assert.equal(f.button('Prepare task for owner review'),undefined);
});

test('conflicts do not claim success and remain retryable after refresh',async()=>{
 const f=fixture({prepareResult:{ok:false,status:409}});await settle();await f.click('Approved proposals');await f.click('Prepare task for owner review');
 assert.match(f.status(),/Refresh approved proposals before trying again/);assert.equal(f.button('Prepare task for owner review').disabled,false);
});

test('pending and approved navigation serialize preparation; disposal ignores late results',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve});
 const f=fixture({intercept:async(path,options,body)=>{if(body?.action==='prepare_task')await blocked;return null}});
 await settle();await f.click('Approved proposals');await f.click('Prepare task for owner review');
 assert.equal(f.button('Pending reviews').disabled,true);assert.equal(f.button('Refresh approved proposals').disabled,true);
 f.button('Prepare task for owner review').listeners.click();await settle();assert.equal(f.calls.filter(call=>call.body?.action==='prepare_task').length,1);
 const status=f.status();f.dispose();f.container.replaceChildren('Another workspace');release();await settle();
 assert.deepEqual(f.container.children,['Another workspace']);assert.equal(f.status(),status);
});

test('approved pagination and refresh preserve page cursor; pending resets it',async()=>{
 const f=fixture();await settle();await f.click('Approved proposals');await f.click('Next approved proposals');
 assert.equal(f.calls.findLast(call=>call.path.includes('view=approved')).path,'/api/employee-workflow-reviews?view=approved&after=page2');
 await f.click('Refresh approved proposals');assert.ok(f.calls.findLast(call=>call.path.includes('view=approved')).path.endsWith('after=page2'));
 await f.click('Previous approved proposals');assert.equal(f.calls.findLast(call=>call.path.includes('view=approved')).path,'/api/employee-workflow-reviews?view=approved');
 await f.click('Pending reviews');assert.equal(f.button('Next approved proposals').hidden,true);assert.equal(f.button('Approved proposals').hidden,false);
});

for(const status of ['approved','executed','cancelled'])test('replayed '+status+' request is described accurately',async()=>{
 const f=fixture({prepareResult:{ok:true,data:{ok:true,request:{id:'r1',status},execution:{performed:false}}}});await settle();await f.click('Approved proposals');await f.click('Prepare task for owner review');
 assert.doesNotMatch(f.status(),/^Task prepared\./);assert.match(f.status(),new RegExp(status==='approved'?'already has owner approval':status==='executed'?'already executed earlier':'cancelled'));
});
