import fs from 'node:fs';
import assert from 'node:assert/strict';

const home=fs.readFileSync('public/home.html','utf8');
const pricing=fs.readFileSync('public/pricing/index.html','utf8');

for(const [source,name] of [[home,'home'],[pricing,'pricing page']]){
  assert.match(source,/v248PricingSelectorParity/,name+' should carry the V248 selector layer');
  assert.doesNotMatch(source,/v247PricingContinuity|v247PricingSelector/,name+' should not retain the superseded V247 selector style id');
}

assert.match(home,/#pricing \.pricing-tabs\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
assert.match(home,/#pricing \.pricinggrid\{display:block;max-width:760px;margin:0 auto\}/);
assert.match(home,/#pricing \.pricecard\{display:none/);
assert.match(home,/homePricingProtect:checked~\.pricinggrid \.plan-protect/);
assert.match(home,/@media\(max-width:760px\)[\s\S]*grid-auto-flow:column/);
assert.match(home,/<fieldset class="pricing-selector-fieldset"><legend class="pricing-selector-legend">Choose a pricing plan<\/legend>/);
assert.match(home,/id="homePricingProtect" aria-controls="homePricingPanelProtect" checked/);
assert.match(home,/id="homePricingPanelProtect" class="pricecard featured plan-protect"/);

assert.match(pricing,/\.plan-tabs\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
assert.match(pricing,/\.pricegrid\{display:block;max-width:760px;margin:0 auto\}/);
assert.match(pricing,/\.pricegrid \.pricecard\{display:none/);
assert.match(pricing,/pricingPlanProtect:checked~\.pricegrid \.plan-protect/);
assert.match(pricing,/@media\(max-width:760px\)[\s\S]*grid-auto-flow:column/);
assert.match(pricing,/<fieldset class="pricing-selector-fieldset"><legend class="pricing-selector-legend">Choose a pricing plan<\/legend>/);
assert.match(pricing,/id="pricingPlanProtect" aria-controls="pricingPanelProtect" checked/);
assert.match(pricing,/id="pricingPanelProtect" class="pricecard plan-protect"/);

for(const [name,price] of [['Monitor','P149'],['Protect','P349'],['Control','P699'],['Network','P1,299'],['Partner','P2,499']]){
  assert.ok(home.includes(`<span>${name}</span><b>${price}</b>`));
  assert.ok(pricing.includes(`<span>${name}</span><b>${price}</b>`));
}

console.log('V248_PRICING_SELECTOR_PARITY_PASS');
