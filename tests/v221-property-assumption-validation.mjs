import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const production=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const workspaceRuntimeAsset=production.match(/const WORKSPACE_RUNTIME_ASSET="([^"]+)";/)?.[1]||'';
assert.match(workspaceRuntimeAsset,/^\/js\/workspace-runtime-[a-z0-9.-]+\.js$/i,'workspace runtime identity must stay versioned and first-party');
const runtime=fs.readFileSync(new URL(`../public${workspaceRuntimeAsset}`,import.meta.url),'utf8');
const section=runtime.slice(runtime.indexOf('function propertyNumber('),runtime.indexOf('function propertyRiskNotes('));
assert.ok(section.startsWith('function propertyNumber(')&&section.includes('function propertyDealScenario()'),'property calculation seam exists');
const values={propertyPurchasePrice:'2400000',propertyMonthlyRent:'15000',propertyDeposit:'600000',propertyInterestRate:'7.5',propertyLoanYears:'20'};
const document={getElementById(id){return {value:values[id]??''}}};
const context=vm.createContext({document});
vm.runInContext(section,context);
const scenario=()=>vm.runInContext('propertyDealScenario()',context);
assert.equal(scenario().grossYield,7.5,'valid inputs retain the known gross yield');
assert.equal(scenario().loan,1800000,'valid financing retains the intended principal');

for(const [id,value] of [
  ['propertyVacancy','125'],['propertyVacancy','-1'],['propertyOperatingCosts','-200'],
  ['propertyDeposit','2500000'],['propertyInterestRate','101'],
  ['propertyLoanYears','0'],['propertyLoanYears','1.5'],['propertyAppreciation','-101'],['propertyAcquisitionCosts','oops']
]){
  values[id]=value;
  assert.equal(scenario(),null,`${id}=${value} must stop the analysis rather than change an assumption or emit NaN`);
  assert.equal(vm.runInContext('propertyDealInputError()?.id',context),id,`error must identify ${id}`);
  delete values[id];
}
assert.equal(scenario().grossYield,7.5,'clearing invalid optional inputs restores valid calculation');
const box={safeHTML:''};
document.getElementById=id=>id==='propertyDealResults'?box:{value:values[id]??''};
context.renderPropertyScenarioComparison=()=>{};
context.escapeHtml=value=>value;
const calculate=runtime.slice(runtime.indexOf('function calculatePropertyDeal()'),runtime.indexOf('function resetPropertyDeal()'));
vm.runInContext(calculate,context);
values.propertyVacancy='125';
assert.equal(vm.runInContext('calculatePropertyDeal()',context),false,'invalid calculation must not produce a result');
assert.match(box.safeHTML,/Check vacancy assumption before analysing the deal/,'visible error must name the invalid input');
console.log('V221_PROPERTY_ASSUMPTION_VALIDATION_PASS');
