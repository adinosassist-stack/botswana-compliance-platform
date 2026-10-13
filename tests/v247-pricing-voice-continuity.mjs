import fs from 'node:fs';
import assert from 'node:assert/strict';

const home=fs.readFileSync('public/home.html','utf8');
const pricing=fs.readFileSync('public/pricing/index.html','utf8');
const voice=fs.readFileSync('public/js/thebe-live-voice.js','utf8');
const css=fs.readFileSync('public/assets/thebe-spatial-dock-v246.css','utf8');
const entry=fs.readFileSync('cloudflare/src/production-entry.js','utf8');

// The dedicated pricing surface remains the complete five-plan catalogue.
for(const [name,price] of [['Monitor','P149'],['Protect','P349'],['Control','P699'],['Network','P1,299'],['Partner','P2,499']]){
  assert.ok(pricing.includes(`<span>${name}</span><b>${price}</b>`),`pricing page must retain published ${name} ${price}`);
}
assert.match(pricing,/pricingPlanProtect" aria-controls="pricingPanelProtect" checked/);
assert.match(pricing,/pricingPlanPartner:checked~\.pricegrid \.plan-partner\{display:flex/);
assert.match(pricing,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);

// The refreshed acquisition page intentionally keeps the three core SME plans
// visible and routes specialist Network/Partner buyers to the full catalogue.
assert.doesNotMatch(home,/homePricingProtect|homePricingPanelProtect|pricing-selector-fieldset/,'home must not restore the legacy five-plan selector');
for(const [name,price] of [['Monitor','P149'],['Protect','P349'],['Control','P699']]){
  assert.match(home,new RegExp(`<h3>${name}<\\/h3>[\\s\\S]*?${price.replace(',','\\,')}`),`home must retain core plan ${name} ${price}`);
}
assert.match(home,/See Network and Partner plans →/,'home must route specialist plans to dedicated pricing');
assert.doesNotMatch(home,/>P1,299 <small>\/ month<\/small>|>P2,499 <small>\/ month<\/small>/,'specialist prices must stay on the dedicated pricing page');

// Voice continuity still publishes the complete catalogue and release identity.
assert.match(voice,/const RELEASE="20261002-pricing-voice-continuity-v247"/);
assert.match(voice,/DOCK_RELEASE="20261002-pricing-voice-continuity-v247"/);
assert.match(voice,/voiceScreenTranscript=el\("div","thebe-voice-screen-transcript"\)/);
assert.match(voice,/Same Thebe AI · current workspace context/);
assert.match(voice,/Continue by voice or typing/);
assert.doesNotMatch(voice,/setPhase\("idle","Talk to Thebe"[^\n]+\n\s+voiceInput="";voiceOutput=""/);
assert.match(css,/\.thebe-voice-screen-transcript/);
assert.match(entry,/THEBE_LIVE_VOICE_RELEASE="20261002-pricing-voice-continuity-v247"/);
assert.match(entry,/thebe-spatial-dock-v246\.css\?v=20261002-v253/);

console.log('V247_PRICING_VOICE_CONTINUITY_PASS');
