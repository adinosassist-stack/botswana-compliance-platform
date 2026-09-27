import assert from "node:assert/strict";
import fs from "node:fs";
import {
  THEBE_MARKET_PROFILE_VERSION,
  DEFAULT_RUNTIME_MARKET_CODE,
  marketProfile,
  runtimeMarketProfile,
  marketRollout,
  marketBusinessDate,
  formatMarketMajor,
  formatMarketMinor,
  marketMoneyTokens
} from "../cloudflare/src/market-profile.js";
import {__moneyIntelligenceTest as money} from "../cloudflare/src/money-intelligence.js";

assert.match(THEBE_MARKET_PROFILE_VERSION,/2026-09-27/);
assert.equal(DEFAULT_RUNTIME_MARKET_CODE,"BW");

const bw=marketProfile("bw");
assert.equal(bw.country,"Botswana");
assert.equal(bw.rolloutStatus,"live");
assert.equal(bw.runtimeEnabled,true);
assert.equal(bw.currency,"BWP");
assert.equal(bw.locale,"en-BW");
assert.equal(bw.timeZone,"Africa/Gaborone");
assert.equal(bw.regulatoryPack,"botswana-foundation-pack-v1");

const na=marketProfile("NA");
assert.equal(na.country,"Namibia");
assert.equal(na.rolloutStatus,"next");
assert.equal(na.runtimeEnabled,false);
assert.equal(na.currency,"NAD");
assert.equal(na.regulatoryPack,null);

assert.equal(runtimeMarketProfile("BW")?.code,"BW");
assert.equal(runtimeMarketProfile("NA"),null);
assert.equal(runtimeMarketProfile("ZA"),null);
assert.deepEqual(marketRollout(),{live:["BW"],next:["NA"]});

assert.equal(marketBusinessDate(new Date("2026-09-26T22:30:00.000Z"),"BW"),"2026-09-27");
assert.equal(formatMarketMajor(1250.5,{marketCode:"BW",minimumFractionDigits:2,maximumFractionDigits:2}),"P1,250.50");
assert.equal(formatMarketMinor(125050,{marketCode:"BW"}),"P1,250.50");
assert.deepEqual(marketMoneyTokens("BW"),{prefix:["P","BWP"],suffix:["pula","BWP"]});
assert.equal(marketMoneyTokens("NA"),null);

assert.equal(money.extractSpendWhatIfMinor("Can I spend P20,000 this week?",{marketCode:"BW"}),2000000);
assert.equal(money.extractSpendWhatIfMinor("What happens if I buy equipment for P20k?",{marketCode:"BW"}),2000000);
assert.equal(money.extractSpendWhatIfMinor("Can the business spend 20,000 pula?",{marketCode:"BW"}),2000000);
assert.equal(money.extractSpendWhatIfMinor("What if it costs BWP 1,250.50?",{marketCode:"BW"}),125050);
assert.equal(money.extractSpendWhatIfMinor("Can I spend NAD 20,000?",{marketCode:"NA"}),null);
assert.equal(money.extractSpendWhatIfMinor("Can I spend R20,000?",{marketCode:"ZA"}),null);
assert.equal(money.extractSpendWhatIfBwpMinor("Can I spend P20,000 this week?"),2000000);

const businessContext=fs.readFileSync(new URL("../cloudflare/src/business-context.js",import.meta.url),"utf8");
const moneySource=fs.readFileSync(new URL("../cloudflare/src/money-intelligence.js",import.meta.url),"utf8");
const homepage=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
assert.match(businessContext,/from "\.\/market-profile\.js"/);
assert.match(businessContext,/function activeMarketContext\(\)/);
assert.match(businessContext,/market:activeMarketContext|const market=activeMarketContext\(\)/);
assert.doesNotMatch(businessContext,/toLocaleString\("en-BW"/);
assert.match(moneySource,/extractSpendWhatIfMinor/);
assert.match(moneySource,/runtimeMarketProfile\(DEFAULT_RUNTIME_MARKET_CODE\)/);
assert.match(homepage,/Live in Botswana · Namibia next/);
assert.doesNotMatch(homepage,/Live in Namibia/);

console.log("v168 market profile foundation: Botswana live, Namibia next and runtime-gated");
