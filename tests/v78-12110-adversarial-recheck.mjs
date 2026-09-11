import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/server.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const checks=[];const ok=(name,cond)=>{assert.ok(cond,name);checks.push(name)};

ok('release version 1.21.10',pkg.version.startsWith('1.21.')&&Number(pkg.version.split('.')[2]||0)>=20);
ok('PWA cache 1.21.10',sw.includes(`bw-business-protection-v78-${pkg.version}`));

// Pass 1: profile/tax fail-closed behavior.
ok('profile keeps unknown turnover blank',html.includes('set("pTurnover",p.turnover??"")'));
ok('wizard keeps unknown turnover blank',html.includes('wTurnover.value=p.turnover??""'));
ok('optional number helper preserves blank as null',html.includes('if(raw==="")return null'));
ok('profile save uses optional turnover parser',html.includes('turnover=optionalNonNegativeNumber(pTurnover)'));
ok('wizard save uses optional turnover parser',html.includes('turnover:optionalNonNegativeNumber(wTurnover)'));
ok('VAT category display no longer derives from turnover',html.includes('const confirmedVatCategory=String(p.vatCategory||"").trim()')&&!html.includes('(p.turnover||0)>=12000000'));
ok('VAT unconfirmed state is explicit',html.includes('"Category not confirmed"'));
ok('manufacturing route still fails closed',html.includes('if(!Number.isFinite(turnover)||turnover<=0)return "Set annual turnover to determine route"'));

// Evaluate clean state helpers.
const helperBlock=html.slice(html.indexOf('function blankBusinessProfile'),html.indexOf('let store=',html.indexOf('function blankBusinessProfile')));
const helperCtx={Math,Date};vm.createContext(helperCtx);vm.runInContext(helperBlock,helperCtx);
const clean=helperCtx.blankCompany('Acme Botswana');
ok('new blank company uses requested name',clean.profile.name==='Acme Botswana');
ok('new blank company has no demo evidence',Array.isArray(clean.evidence)&&clean.evidence.length===0);
ok('new blank company has no demo employees',Array.isArray(clean.employees)&&clean.employees.length===0);
ok('new blank company turnover is unknown not zero',clean.profile.turnover===null);
ok('new blank company has no CIPA demo identifiers',clean.profile.cipaUin===''&&clean.profile.cipaStatus==='');
ok('production initial store is empty before authentication',html.includes('let store={activeCompanyId:null,activeRole:"",companies:[],audit:[]};\nlet state=null;'));
ok('real empty tenant initializes clean workspace, not DEFAULT_STATE',html.includes('nextStore=blankWorkspaceState(currentUser.tenantName||"My Business",currentUser.role)')&&!html.match(/else\{(?:store|nextStore)=structuredClone\(DEFAULT_STATE\)/));
ok('demo reset is preview-only',html.includes('function resetDemo(){if(!STANDALONE_PREVIEW)return false'));
ok('enter standalone preview is preview-only',html.includes('function enterStandalonePreview(){if(!STANDALONE_PREVIEW)return false'));
ok('logout scrubs local workspace state',html.includes('replaceWorkspaceStore({activeCompanyId:null,activeRole:"",companies:[],audit:[]})'));

// Pass 2: manager boundary and direct action guards.
ok('Business details save is owner guarded',html.includes('if(currentWorkspaceRole()!=="owner"){let sr=document.getElementById("srStatus");if(sr)sr.textContent="Only the account owner can edit Business details."'));
ok('Add company function is owner guarded',html.includes('function addCompany(){\n if(currentWorkspaceRole()!=="owner")'));
ok('Add company uses clean factory not DEFAULT_COMPANY',html.includes('const c=blankCompany(name)')&&!html.match(/function addCompany\(\)[\s\S]{0,500}structuredClone\(DEFAULT_COMPANY\)/));
ok('auth me carries tenant name in Node',server.includes('tenantName:req.auth.tenant_name'));
ok('auth me carries tenant name in Worker',worker.includes('tenantName:a.tenant_name'));
ok('Worker auth loads tenant name',worker.includes('t.name tenant_name FROM sessions'));
ok('Node auth loads tenant name',server.includes('t.name tenant_name from sessions'));
ok('manager projection redacts pay-sensitive facts in worker',worker.includes('delete p.annualTaxableSupplies;delete p.highestMonthlyEmployeePay'));
ok('manager projection redacts pay-sensitive facts in node',server.includes('delete p.annualTaxableSupplies;delete p.highestMonthlyEmployeePay'));
ok('manager write merge exists in worker',worker.includes('a.role==="manager"?mergeManagerWorkspaceState(previousState,submittedState):submittedState'));
ok('manager write merge exists in node',server.includes('nextState=mergeManagerWorkspaceState(cur.rows[0]?.state||{},p.data.state)'));

// Dynamically verify manager merge semantics using the worker helper.
const mergeStart=worker.indexOf('function mergeManagerWorkspaceState');
const mergeEnd=worker.indexOf('async function stateGet',mergeStart);
const mergeCtx={Map,Number,Array,String,Math};vm.createContext(mergeCtx);vm.runInContext(worker.slice(mergeStart,mergeEnd),mergeCtx);
const base={activeCompanyId:'c1',activeRole:'owner',audit:[{x:1}],companies:[{id:'c1',profile:{name:'Owner Co',employees:2,turnover:7000000,vat:true},evidence:[{id:'e1'}],cases:[]}]};
const attack={activeCompanyId:'evil',activeRole:'owner',audit:[],companies:[{id:'c1',profile:{name:'HACKED',employees:9,turnover:1,vat:false},evidence:[{id:'e2'}],cases:[{id:'case1'}]},{id:'c2',profile:{name:'Injected'}}]};
const merged=mergeCtx.mergeManagerWorkspaceState(base,attack);
ok('manager cannot add a company through state PUT',merged.companies.length===1&&merged.companies[0].id==='c1');
ok('manager cannot rename or alter owner profile through state PUT',merged.companies[0].profile.name==='Owner Co'&&merged.companies[0].profile.turnover===7000000&&merged.companies[0].profile.vat===true);
ok('manager can keep employee count operationally current',merged.companies[0].profile.employees===9);
ok('manager operational evidence changes can persist',merged.companies[0].evidence[0].id==='e2');
ok('manager cannot forge active company id',merged.activeCompanyId==='c1');
ok('manager cannot replace audit history',merged.audit.length===1&&merged.audit[0].x===1);

console.log(`v78 1.21.10 adversarial recheck: ${checks.length}/${checks.length} checks passed`);
