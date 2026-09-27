import assert from "node:assert/strict";
import fs from "node:fs";
import {
  THEBE_MARKET_PROFILE_VERSION,
  marketActivationReadiness,
  runtimeMarketProfile,
  marketRollout,
  __marketProfileTest
} from "../cloudflare/src/market-profile.js";
import {regulatoryPackBundleForMarket} from "../cloudflare/src/regulatory-pack-registry.js";

assert.equal(THEBE_MARKET_PROFILE_VERSION,"2026-09-27.v2");

const bw=marketActivationReadiness("BW");
assert.equal(bw.registered,true);
assert.equal(bw.ready,true);
assert.equal(bw.rolloutStatus,"live");
assert.equal(bw.runtimeEnabled,true);
assert.equal(bw.regulatoryPack,"botswana-foundation-pack-v1");
assert.deepEqual(bw.blockers,[]);
assert.equal(runtimeMarketProfile("BW")?.country,"Botswana");
assert.ok(regulatoryPackBundleForMarket("BW"));

const na=marketActivationReadiness("NA");
assert.equal(na.registered,true);
assert.equal(na.ready,false);
assert.equal(na.rolloutStatus,"next");
assert.equal(na.runtimeEnabled,false);
assert.equal(na.regulatoryPack,null);
assert.deepEqual(na.blockers,["runtime_disabled","rollout_not_live","regulatory_pack_missing"]);
assert.equal(runtimeMarketProfile("NA"),null);
assert.equal(regulatoryPackBundleForMarket("NA"),null);

const unknown=marketActivationReadiness("ZA");
assert.equal(unknown.registered,false);
assert.equal(unknown.ready,false);
assert.deepEqual(unknown.blockers,["market_not_registered"]);
assert.equal(runtimeMarketProfile("ZA"),null);

const complete={
  code:"XX",country:"Example",rolloutStatus:"live",runtimeEnabled:true,
  currency:"XXX",currencySymbol:"X",locale:"en-XX",timeZone:"Africa/Gaborone",
  regulatoryPack:"example-pack-v1",moneyPrefixTokens:["X"],moneySuffixTokens:["XXX"]
};
assert.deepEqual(__marketProfileTest.activationBlockers(complete),[]);
assert.deepEqual(__marketProfileTest.activationBlockers({...complete,rolloutStatus:"next"}),["rollout_not_live"]);
assert.deepEqual(__marketProfileTest.activationBlockers({...complete,regulatoryPack:null}),["regulatory_pack_missing"]);
assert.deepEqual(__marketProfileTest.activationBlockers({...complete,moneyPrefixTokens:[]}),["money_tokens_missing"]);
assert.deepEqual(__marketProfileTest.activationBlockers({...complete,currency:""}),["currency_config_incomplete"]);

assert.deepEqual(marketRollout(),{live:["BW"],next:["NA"]});

const source=fs.readFileSync(new URL("../cloudflare/src/market-profile.js",import.meta.url),"utf8");
const homepage=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
assert.match(source,/profile\.runtimeEnabled!==true/);
assert.match(source,/profile\.rolloutStatus!==\"live\"/);
assert.match(source,/regulatory_pack_missing/);
assert.match(source,/money_tokens_missing/);
assert.match(source,/marketActivationReadiness\(code\)\.ready/);
assert.match(homepage,/Live in Botswana · Namibia next/);
assert.doesNotMatch(homepage,/Live in Namibia/);

console.log("v172 market activation gate: Botswana live, Namibia next, expansion fails closed");
