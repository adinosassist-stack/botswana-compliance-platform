import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
const start=source.indexOf('async function renderPeopleOperationsHub(){');
const end=source.indexOf('\nfunction renderPeopleInfographics(',start);
assert(start>=0&&end>start);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function harness(){
  const requests=new Map(),elements=new Map();
  const read=url=>{const request=deferred();requests.set(url,request);return request.promise};
  const context=vm.createContext({
    store:{activeCompanyId:'company-a'},role:'owner',
    roleCanView:()=>true,currentWorkspaceRole:()=>context.role,
    browserGaboroneDate:()=> '2026-10-19',recentlyRemovedEmployeeIds:new Set(),
    apiJson:read,reportingAnalyticsJson:read,renderPeopleInfographics:()=>{},
    document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{textContent:'',setAttribute(){}});return elements.get(id)}}
  });
  vm.runInContext(source.slice(start,end),context);
  return {context,requests,elements,text:id=>elements.get(id)?.textContent};
}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
const h=harness(),finished=h.context.renderPeopleOperationsHub();
h.requests.get('/api/employees').resolve({items:[{id:'e1',status:'active'}]});
await flush();
assert.equal(h.text('peopleActiveEmployees'),1,'employee data must appear while risk and reporting are still pending');
assert.match(h.text('peopleRefreshStatus'),/Updating/);
h.requests.get('/api/daily-reporting/dashboard?date=2026-10-19').resolve({coverage:75});
await flush();
assert.equal(h.text('peopleReportingCoverage'),'75%','reporting must paint before the slow risk check');
h.requests.get('/api/hr/cases').reject(new Error('offline'));
h.requests.get('/api/employer-risk').resolve({riskBand:'low',dimensions:{contractCoverage:100},findings:[]});
await finished;
assert.equal(h.text('peopleProtectionBand'),'Low');
assert.equal(h.text('peopleOpenCases'),'—','failed sources must never become a zero count');
assert.match(h.text('peopleRefreshStatus'),/1 source unavailable/);

for(const change of [h=>{h.context.store.activeCompanyId='company-b'},h=>{h.context.role='employee'},h=>{h.context.renderPeopleOperationsHub.epoch++}]){
  const h=harness(),done=h.context.renderPeopleOperationsHub();
  const before=h.text('peopleActiveEmployees');change(h);
  for(const request of h.requests.values())request.resolve({items:[{id:'stale'}]});
  await done;
  assert.equal(h.text('peopleActiveEmployees'),before,'stale company, role or render must not publish results');
}
console.log('PASS: People sections publish independently; failed data and stale results remain guarded');
