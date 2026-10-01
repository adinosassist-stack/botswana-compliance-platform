import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/js/workspace-runtime-20260929c.js',import.meta.url),'utf8');
const production=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
assert(/const WORKSPACE_RUNTIME_RELEASE="\d{8}-[a-z0-9-]+-v\d+";/.test(production)&&production.includes('${WORKSPACE_RUNTIME_ASSET}?v=${WORKSPACE_RUNTIME_RELEASE}'),'the changed workspace runtime must be cache-busted');
const start=source.indexOf('let opsLiveRefreshInFlight=false;');
const end=source.indexOf('async function renderPeopleReportingSetup(){',start);
assert(start>0&&end>start,'live reporting refresh seam must be present');

let active=false,visibility='visible',requests=0,applied=[],resolveRequest;
const date={value:'2026-10-01'},location={value:''};
const listeners={};
const context=vm.createContext({
  document:{get visibilityState(){return visibility},getElementById(id){return id==='dailyreports'?{classList:{contains:()=>active}}:id==='opsReportDate'?date:id==='opsLocationFilter'?location:null},addEventListener(type,fn){listeners[type]=fn}},
  window:{__THEBE_WORKSPACE_READY__:true,addEventListener(type,fn){listeners[type]=fn}},
  currentWorkspaceRole:()=> 'owner',browserGaboroneDate:()=> '2026-10-01',
  reportingAnalyticsJson:()=>{requests++;return new Promise(resolve=>{resolveRequest=resolve})},
  applyOpsDashboard:value=>applied.push(value),
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
console.log('PASS: V220 live reporting refreshes an active dashboard, rejects stale filters and pauses when hidden.');
