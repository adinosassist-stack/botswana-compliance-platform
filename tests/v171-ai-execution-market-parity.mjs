import assert from "node:assert/strict";
import fs from "node:fs";
import {DEFAULT_RUNTIME_MARKET_CODE,runtimeMarketProfile} from "../cloudflare/src/market-profile.js";

const market=runtimeMarketProfile(DEFAULT_RUNTIME_MARKET_CODE);
assert.equal(market?.code,"BW");
assert.equal(market?.country,"Botswana");
assert.equal(market?.currency,"BWP");
assert.equal(runtimeMarketProfile("NA"),null);

const agentic=fs.readFileSync(new URL("../cloudflare/src/agentic-core.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const homepage=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

assert.match(agentic,/extractSpendWhatIfMinor/);
assert.doesNotMatch(agentic,/import \{extractSpendWhatIfBwpMinor/);
assert.match(agentic,/market:context\.market/);
assert.match(agentic,/market:context\.market,\n\s+identity:context\.identity/);
assert.match(agentic,/currency:String\(market\.currency\|\|finance\.currency\|\|""\)/);
assert.match(agentic,/currency:String\(observation\?\.market\?\.currency\|\|observation\?\.finance\?\.currency\|\|""\)/);
assert.match(agentic,/extractSpendWhatIfMinor\(goal,\{marketCode:observation\?\.market\?\.code\}\)/);
assert.doesNotMatch(agentic,/currency:"BWP"/);

assert.match(worker,/from "\.\/market-profile\.js"/);
assert.match(worker,/const activeMarket=businessPayload\?\.market\|\|runtimeMarketProfile\(DEFAULT_RUNTIME_MARKET_CODE\)\|\|null/);
assert.match(worker,/market:activeMarket/);
assert.match(worker,/currency:String\(activeMarket\?\.currency/);
assert.match(worker,/business operating in \$\{market\.country\|\|"the active market"\}/);
assert.match(worker,/active market currency is \$\{market\.currency\|\|"unknown"\}/);
assert.match(worker,/exact amount in the active market currency/);
assert.match(worker,/extractSpendWhatIfMinor\(question,\{marketCode:DEFAULT_RUNTIME_MARKET_CODE\}\)/);
assert.match(worker,/operations-performance intelligence assistant for a business operating in \$\{market\?\.country\|\|"the active market"\}/);
assert.doesNotMatch(worker,/single governed business super agent for a Botswana SME/);
assert.doesNotMatch(worker,/grounded operations-performance intelligence assistant for a Botswana SME/);
assert.doesNotMatch(worker,/exact BWP amount/);

assert.match(homepage,/Live in Botswana · Namibia next/);
assert.doesNotMatch(homepage,/Live in Namibia/);

console.log("v171 AI execution market parity: dynamic market identity with Botswana live and Namibia disabled");
