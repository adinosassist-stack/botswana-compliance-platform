import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const production=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const workspaceRuntimeAsset=production.match(/const WORKSPACE_RUNTIME_ASSET="([^"]+)";/)?.[1]||'';
assert.match(workspaceRuntimeAsset,/^\/js\/workspace-runtime-[a-z0-9.-]+\.js$/i,'workspace runtime identity must stay versioned and first-party');
const source=fs.readFileSync(new URL(`../public${workspaceRuntimeAsset}`,import.meta.url),'utf8');
assert(/const WORKSPACE_RUNTIME_RELEASE="\d{8}-[a-z0-9-]+-v\d+";/.test(production)&&production.includes('${WORKSPACE_RUNTIME_ASSET}?v=${WORKSPACE_RUNTIME_RELEASE}'),'the changed workspace runtime must be cache-busted');
const start=source.indexOf('let opsLiveRefreshInFlight=false;');
const end=source.indexOf('async function renderPeopleReportingSetup(){',start);
assert(start>0&&end>start,'live reporting refresh seam must be present');

let active=false,visibility='visible',role='owner',requests=0,applied=[],cleared=0,resolveRequest,rejectRequest;
const store={activeCompanyId:'company-1'};
const date={value:'2026-10-01'},location={value:''};
const listeners={};
const context=vm.createContext({
  document:{get visibilityState(){return visibility},getElementById(id){return id==='dailyreports'?{classList:{contains:()=>active}}:id==='opsReportDate'?date:id==='opsLocationFilter'?location:null},addEventListener(type,fn){listeners[type]=fn}},
  window:{__THEBE_WORKSPACE_READY__:true,addEventListener(type,fn){listeners[type]=fn}},
  store,currentWorkspaceRole:()=>role,browserGaboroneDate:()=> '2026-10-01',
  reportingAnalyticsJson:()=>{requests++;return new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject})},
  applyOpsDashboard:value=>applied.push(value),clearOpsDashboard:()=>cleared++,
  setInterval:(fn,ms)=>{assert.equal(ms,30000);listeners.interval=fn},
});
vm.runInContext('let opsReportingSetupEpoch=0;'+source.slice(start,end),context);

await vm.runInContext('refreshLiveDailyOperations()',context);
assert.equal(requests,0,'inactive views must not poll');
active=true;
const first=vm.runInContext('refreshLiveDailyOperations()',context);
await vm.runInContext('refreshLiveDailyOperations()',context);
assert.equal(requests,1,'overlapping refreshes must share the bounded request');
resolveRequest({reports:[{id:'report-1'}]});await first;
assert.equal(applied.length,1,'a new report updates the open dashboard');

const stale=vm.runInContext('refreshLiveDailyOperations()',context);
location.value='branch-2';resolveRequest({reports:[{id:'old-filter'}]});await stale;
assert.equal(applied.length,1,'a response for an old filter cannot overwrite the new view');
visibility='hidden';await vm.runInContext('refreshLiveDailyOperations()',context);
assert.equal(requests,2,'hidden tabs must stop polling');
visibility='visible';listeners.visibilitychange();
assert.equal(requests,3,'returning to the visible dashboard refreshes immediately');
resolveRequest({reports:[{id:'report-2'}]});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(applied.length,2);
const oldCompany=vm.runInContext('refreshLiveDailyOperations()',context);
store.activeCompanyId='company-2';resolveRequest({reports:[{id:'old-company'}]});await oldCompany;
assert.equal(applied.length,2,'old company responses must not update another company');
const oldRole=vm.runInContext('refreshLiveDailyOperations()',context);
role='employee';resolveRequest({reports:[{id:'old-role'}]});await oldRole;
assert.equal(applied.length,2,'a response cannot restore data after a role change');
await vm.runInContext('refreshLiveDailyOperations()',context);assert.equal(requests,5,'non-manager roles cannot poll');
role='owner';
const oldFailure=vm.runInContext('refreshLiveDailyOperations()',context);
store.activeCompanyId='company-3';rejectRequest(Error('stale company failed'));await oldFailure;
assert.equal(cleared,0,'an old company error must not clear the current company');
const failure=vm.runInContext('refreshLiveDailyOperations()',context);
rejectRequest(Error('offline'));await failure;
assert.equal(cleared,1,'current failed read must replace stale reporting data');
const recovered=vm.runInContext('refreshLiveDailyOperations()',context);
resolveRequest({reports:[{id:'recovered'}]});await recovered;
assert.equal(applied.length,3,'polling recovers after an error');
console.log('PASS: V220 live reporting refreshes an active dashboard, rejects stale filters, companies and roles, clears current failures and recovers.');
