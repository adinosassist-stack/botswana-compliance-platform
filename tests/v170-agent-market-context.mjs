import assert from "node:assert/strict";
import fs from "node:fs";
import {__businessContextTest as business,BUSINESS_CONTEXT_VERSION} from "../cloudflare/src/business-context.js";
import {DEFAULT_RUNTIME_MARKET_CODE,runtimeMarketProfile} from "../cloudflare/src/market-profile.js";

assert.equal(BUSINESS_CONTEXT_VERSION,"2026-09-27.v167");
assert.equal(DEFAULT_RUNTIME_MARKET_CODE,"BW");

const active=business.activeMarketContext();
assert.deepEqual(active,{
  code:"BW",
  country:"Botswana",
  rolloutStatus:"live",
  currency:"BWP",
  currencySymbol:"P",
  locale:"en-BW",
  timeZone:"Africa/Gaborone",
  regulatoryPack:"botswana-foundation-pack-v1"
});
assert.equal(Object.isFrozen(active),true);
assert.equal(runtimeMarketProfile("NA"),null);

const brief=business.buildDailyBusinessBrief({
  version:BUSINESS_CONTEXT_VERSION,
  observedAt:"2026-09-27T07:00:00.000Z",
  businessDate:"2026-09-27",
  market:active,
  finance:{cashPositionMinor:0,receivables:{},payables:{},today:{},reconciliation:{}},
  compliance:{},
  operations:{},
  sales:{},
  moneyIntelligence:{},
  durableMemory:{items:[]}
});
assert.deepEqual(brief.market,active);
assert.equal(brief.metrics.currency,"BWP");
assert.equal(brief.businessDate,"2026-09-27");
assert.equal(brief.authority.executionAllowed,false);

const source=fs.readFileSync(new URL("../cloudflare/src/business-context.js",import.meta.url),"utf8");
const homepage=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
assert.match(source,/const market=activeMarketContext\(\),role=/);
assert.match(source,/businessDate=marketBusinessDate\(now,market\.code\)/);
assert.match(source,/currency:market\.currency/);
assert.match(source,/market,\n\s+roleScope:/);
assert.match(source,/market,\n\s+language:/);
assert.doesNotMatch(source,/currency:runtimeMarketProfile\("BW"\)/);
assert.doesNotMatch(source,/marketBusinessDate\(now,"BW"\)/);
assert.doesNotMatch(source,/formatMarketMinor\(value,\{marketCode:"BW"\}\)/);
assert.match(source,/activeBusinessDate\(new Date\(\),marketCode\)/);
assert.match(source,/localizeBriefPriority\(item,metrics,language,market\.code\)/);
assert.match(source,/marketCode:market\.code/);
assert.match(homepage,/Live in Botswana · Namibia next/);
assert.doesNotMatch(homepage,/Live in Namibia/);

console.log("v170 agent market context: Botswana explicit, Namibia runtime-disabled");
