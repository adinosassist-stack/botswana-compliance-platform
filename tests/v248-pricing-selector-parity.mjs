import fs from 'node:fs';
import assert from 'node:assert/strict';

const home=fs.readFileSync('public/home.html','utf8');
const pricing=fs.readFileSync('public/pricing/index.html','utf8');

// The dedicated pricing surface keeps the full five-plan selector and remains
// the source of truth for Network/Partner detail.
assert.match(pricing,/v248PricingSelectorParity/,'pricing page should carry the V248 selector layer');
assert.doesNotMatch(pricing,/v247PricingContinuity|v247PricingSelector/,'pricing page should not retain the superseded V247 selector style id');
assert.match(pricing,/\.plan-tabs\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
assert.match(pricing,/\.pricegrid\{display:block;max-width:760px;margin:0 auto\}/);
assert.match(pricing,/\.pricegrid \.pricecard\{display:none/);
assert.match(pricing,/pricingPlanProtect:checked~\.pricegrid \.plan-protect/);
assert.match(pricing,/@media\(max-width:760px\)[\s\S]*grid-auto-flow:column/);
assert.match(pricing,/<fieldset class="pricing-selector-fieldset"><legend class="pricing-selector-legend">Choose a pricing plan<\/legend>/);
assert.match(pricing,/id="pricingPlanProtect" aria-controls="pricingPanelProtect" checked/);
assert.match(pricing,/id="pricingPanelProtect" class="pricecard plan-protect"/);

for(const [name,price] of [['Monitor','P149'],['Protect','P349'],['Control','P699'],['Network','P1,299'],['Partner','P2,499']]){
  assert.ok(pricing.includes(`<span>${name}</span><b>${price}</b>`),`pricing page should retain ${name} ${price}`);
}

// The public acquisition page intentionally reduces choice overload to the
// three core SME plans while linking the two specialist plans to pricing.
assert.doesNotMatch(home,/pricing-selector-fieldset|homePricingProtect|homePricingPanelProtect/,'home should not restore the five-plan selector');
assert.match(home,/Botswana launch pricing/);
for(const [name,price] of [['Monitor','P149'],['Protect','P349'],['Control','P699']]){
  assert.match(home,new RegExp(`<h3>${name}<\\/h3>[\\s\\S]*?${price.replace(',','\\,')}`),`home should show ${name} ${price}`);
}
assert.match(home,/Running many locations or managing client businesses\?/);
assert.match(home,/See Network and Partner plans →/);
assert.doesNotMatch(home,/>P1,299 <small>\/ month<\/small>|>P2,499 <small>\/ month<\/small>/,'specialist plan prices should stay on the dedicated pricing page');

// Market-page conversion contract.
assert.match(home,/Know what needs attention\. Run your business from one place\./);
for(const area of ['Money','Work','People','Protect']) assert.match(home,new RegExp(`<h3>${area}<\\/h3>`));
assert.match(home,/Ask the business, not a blank chatbot\./);
assert.match(home,/paid plan activates after Thebe Desk confirms the funds have been received/);
assert.match(home,/data-thebe-prompt="What needs my attention today\?"/);
assert.match(home,/marketing-start-action/);
assert.doesNotMatch(home,/40 AI credits \/ month|150 AI credits \/ month|350 AI credits \/ month/,'home should use buyer-facing AI allowance language');

console.log('V248_PRICING_SELECTOR_PARITY_PASS');