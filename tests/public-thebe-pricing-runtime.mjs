import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('public/js/thebe-live-voice.js','utf8');
const start=source.indexOf('  function publishedPricing(){');
const end=source.indexOf('  function renderMarketingAnswer(',start);
assert.ok(start>=0&&end>start,'public pricing answer seam must exist');
const plans=[['Monitor','P149 / month'],['Protect','P349 / month'],['Control','P699 / month'],['Network','P1,299 / month'],['Partner','P2,499 / month']];
let cards=plans.map(([name,price])=>({querySelector:selector=>({textContent:selector==='h3'?name:price})}));
const context=vm.createContext({MAX_QUESTION:1000,clean:(value,max)=>String(value??'').trim().slice(0,max),document:{querySelectorAll:()=>cards}});
vm.runInContext(source.slice(start,end),context);
function compare(){return vm.runInContext('marketingAnswer("Compare plans")',context)}
for(const [name,price] of plans)assert.ok(compare().includes(`${name} ${price}`),`comparison must include published ${name} pricing`);
assert.doesNotMatch(compare(),/four published plans/,'comparison must not contradict the five-plan catalogue');
cards=[];
for(const [name,price] of plans)assert.ok(compare().includes(`${name} ${price.replaceAll(' ','')}`),`fallback must include ${name} pricing`);
assert.match(compare(),/14-day trial/,'trial information must remain available');
console.log('PUBLIC_THEBE_PRICING_RUNTIME_PASS');
