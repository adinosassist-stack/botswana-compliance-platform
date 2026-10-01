import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(process.env.THEBE_OWNER_SOURCE||'public/js/owner-command-centre.js','utf8');
const start=source.indexOf('  function ensurePropertyPortfolioShell(){');
const end=source.indexOf('  function propertyPortfolioSetValuationOptions(',start);
assert(start>=0&&end>start);
let role='';const service={hidden:true},valuation={hidden:true},shell={};
const context=vm.createContext({q:selector=>selector==='#propertyintelligence'?{}:selector==='#propertyPortfolioWorkspace'?shell:selector==='#propertyValuationServicePanel'?service:selector==='#propertyValuationFormPanel'?valuation:null,canView:()=>['owner','manager'].includes(role),canEdit:()=>role==='owner'});
vm.runInContext(source.slice(start,end),context);
function refresh(){assert.equal(vm.runInContext('ensurePropertyPortfolioShell()',context),shell)}
role='owner';refresh();assert.equal(service.hidden,false,'owner role hydration must reveal the valuation service');assert.equal(valuation.hidden,false,'owner must see signed-report recording');
role='manager';refresh();assert.equal(service.hidden,false,'manager must see service workflow');assert.equal(valuation.hidden,true,'manager cannot record owner-only signed reports');
role='employee';refresh();assert.equal(service.hidden,true,'employee service controls must stay hidden');assert.equal(valuation.hidden,true,'employee signed-report controls must stay hidden');
console.log('V246_PROPERTY_ROLE_REFRESH_PASS');
