import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const source=html.slice(html.indexOf('async function renderPeopleOperationsHub(){'),html.indexOf('\nasync function renderBusinessHub()'));
const elements=new Map();
const context=vm.createContext({document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{textContent:'',style:{},setAttribute(){}});return elements.get(id)}},store:{activeCompanyId:'a'},roleCanView:()=>true,currentWorkspaceRole:()=> 'owner',browserGaboroneDate:()=> '2026-10-03',recentlyRemovedEmployeeIds:new Set(),escapeHtml:value=>String(value).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])),Intl,Date});
vm.runInContext(source,context);
const values={'/api/employees':{items:[{id:1,status:'active'},{id:2,status:'removed'}]},'/api/hr/cases':{items:[{status:'closed'},{status:'open'}]},'/api/employer-risk':{riskBand:'low',dimensions:{contractCoverage:100},findings:[]}};
context.apiJson=async url=>values[url];context.reportingAnalyticsJson=async()=>({coverage:75,missing:[{}],totals:{attention:0},reportingPopulation:{expected:4,expectedSubmitted:3},branches:[{name:'<Office>',expected:2,submittedExpected:2},{name:'Branch',expected:2,submittedExpected:1}]});
await vm.runInContext('renderPeopleOperationsHub()',context);
assert.equal(elements.get('peopleActiveEmployees').textContent,1);assert.equal(elements.get('peopleOpenCases').textContent,1);assert.equal(elements.get('peopleReportingCoverage').textContent,'75%');assert.equal(elements.get('peopleReportingProgress').value,75);assert.equal(elements.get('peopleDonutPercent').textContent,'75%');assert.equal(elements.get('peopleInfoReceived').textContent,3);assert.equal(elements.get('peopleInfoAwaiting').textContent,1);assert.match(elements.get('peopleLocationBars').safeHTML,/&lt;Office&gt;/);assert.match(elements.get('peopleLocationBars').safeHTML,/width:50%/);assert.equal(elements.get('peopleInfoCases').textContent,1);
context.apiJson=async()=>{throw Error('offline')};context.reportingAnalyticsJson=async()=>{throw Error('offline')};
await vm.runInContext('renderPeopleOperationsHub()',context);
assert.equal(elements.get('peopleActiveEmployees').textContent,'—');assert.equal(elements.get('peopleOpenCases').textContent,'—');assert.equal(elements.get('peopleProtectionBand').textContent,'Unavailable');assert.equal(elements.get('peopleReportingProgress').hidden,true);assert.equal(elements.get('peopleDonutPercent').textContent,'—');assert.equal(elements.get('peopleInfoReceived').textContent,'—');assert.equal(elements.get('peopleInfoContractGaps').textContent,'—');assert.match(elements.get('peopleLocationBars').safeHTML,/unavailable/);assert.match(elements.get('peopleFollowupDetail').textContent,/incomplete/);
// A successful empty register is distinct from a failed read.
context.apiJson=async()=>({items:[]});context.reportingAnalyticsJson=async()=>({coverage:null});
await vm.runInContext('renderPeopleOperationsHub()',context);assert.equal(elements.get('peopleActiveEmployees').textContent,0);assert.equal(elements.get('peopleReportingCoverage').textContent,'—');
context.reportingAnalyticsJson=async()=>({coverage:0,reportingPopulation:{expected:0,expectedSubmitted:0},branches:[]});await vm.runInContext('renderPeopleOperationsHub()',context);assert.equal(elements.get('peopleDonutPercent').textContent,'—');assert.equal(elements.get('peopleDonutTitle').textContent,'No reports expected today');
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
// Locations must keep first-run onboarding from intercepting intentional People workspace actions.
const locations=fs.readFileSync('public/js/locations-branches-v335.js','utf8');
const readiness=fs.readFileSync('public/js/workspace-readiness-v305.js','utf8');
assert.match(readiness,/locations-branches-v335\.js\?release=\$\{release\}/,'workspace readiness must cache-bust and load the v335 location runtime');
assert.match(locations,/function peopleIsActive\(\)/,'locations runtime must scope onboarding yielding to the active People workspace');
assert.match(locations,/modal\.classList\.contains\("open"\)/,'locations runtime must only react to an actually open onboarding overlay');
assert.match(locations,/const dismiss=window\.dismissOnboarding/,'locations runtime must prefer the canonical onboarding dismissal path');
assert.match(locations,/onboardingObserver\.observe\(modal,\{attributes:true,attributeFilter:\["class","aria-hidden"\]\}\)/,'locations runtime must catch delayed onboarding reopen races');
assert.match(locations,/\[0,80,240,800,1600\]\.forEach/,'intentional People navigation must recheck the delayed onboarding scheduler window');
assert.ok(locations.includes('[data-view="peopleops"]'),'People navigation must be recognized without globally disabling onboarding');
assert.ok(locations.includes('[data-bw-onclick="addOpsLocation()"]'),'Add location must remain bound to the canonical save action');
console.log('People workspace: data truth, empty states, null coverage, request races, company isolation, refresh recovery and onboarding-safe locations PASS');
