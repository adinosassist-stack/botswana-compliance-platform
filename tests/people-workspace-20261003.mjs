import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const source=html.slice(html.indexOf('async function renderPeopleOperationsHub(){'),html.indexOf('\nasync function renderBusinessHub()'));
const elements=new Map();
const context=vm.createContext({document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{textContent:'',setAttribute(){}});return elements.get(id)}},store:{activeCompanyId:'a'},roleCanView:()=>true,currentWorkspaceRole:()=> 'owner',browserGaboroneDate:()=> '2026-10-03',recentlyRemovedEmployeeIds:new Set(),Intl,Date});
vm.runInContext(source,context);
const values={'/api/employees':{items:[{id:1,status:'active'},{id:2,status:'removed'}]},'/api/hr/cases':{items:[{status:'closed'},{status:'open'}]},'/api/employer-risk':{riskBand:'low',dimensions:{contractCoverage:100},findings:[]}};
context.apiJson=async url=>values[url];context.reportingAnalyticsJson=async()=>({coverage:75,missing:[{}],totals:{attention:0}});
await vm.runInContext('renderPeopleOperationsHub()',context);
assert.equal(elements.get('peopleActiveEmployees').textContent,1);assert.equal(elements.get('peopleOpenCases').textContent,1);assert.equal(elements.get('peopleReportingCoverage').textContent,'75%');assert.equal(elements.get('peopleReportingProgress').value,75);
context.apiJson=async()=>{throw Error('offline')};context.reportingAnalyticsJson=async()=>{throw Error('offline')};
await vm.runInContext('renderPeopleOperationsHub()',context);
assert.equal(elements.get('peopleActiveEmployees').textContent,'—');assert.equal(elements.get('peopleOpenCases').textContent,'—');assert.equal(elements.get('peopleProtectionBand').textContent,'Unavailable');assert.equal(elements.get('peopleReportingProgress').hidden,true);assert.match(elements.get('peopleFollowupDetail').textContent,/incomplete/);
// A successful empty register is distinct from a failed read.
context.apiJson=async()=>({items:[]});context.reportingAnalyticsJson=async()=>({coverage:null});
await vm.runInContext('renderPeopleOperationsHub()',context);assert.equal(elements.get('peopleActiveEmployees').textContent,0);assert.equal(elements.get('peopleReportingCoverage').textContent,'—');
// Late reads cannot overwrite a newer request or a different company's overview.
const pending=[];context.apiJson=url=>new Promise(resolve=>pending.push(()=>resolve(values[url])));context.reportingAnalyticsJson=()=>Promise.resolve({coverage:50});
const older=vm.runInContext('renderPeopleOperationsHub()',context);
context.apiJson=async()=>({items:[]});context.reportingAnalyticsJson=async()=>({coverage:100});await vm.runInContext('renderPeopleOperationsHub()',context);
pending.splice(0).forEach(resolve=>resolve());await older;assert.equal(elements.get('peopleReportingCoverage').textContent,'100%');
context.apiJson=url=>new Promise(resolve=>pending.push(()=>resolve(values[url])));const changed=vm.runInContext('renderPeopleOperationsHub()',context);context.store.activeCompanyId='b';pending.splice(0).forEach(resolve=>resolve());await changed;assert.equal(elements.get('peopleActiveEmployees').textContent,0);
// Refresh is bounded to this workspace and releases its busy state even on failure.
vm.runInContext('renderPeopleOperationsHub=async()=>{throw Error("failed")};renderPeopleReportingSetup=async()=>{}',context);
await assert.rejects(vm.runInContext('refreshPeopleWorkspace()',context));assert.equal(elements.get('peopleRefreshButton').disabled,false);assert.equal(elements.get('peopleRefreshButton').textContent,'Refresh');
assert.match(html,/people-workspace-20261003\.css/);
console.log('People workspace: data truth, empty states, null coverage, request races, company isolation and refresh recovery PASS');
