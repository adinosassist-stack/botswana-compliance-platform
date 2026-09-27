import assert from "node:assert/strict";
import fs from "node:fs";
import {
  REGULATORY_PACK_REGISTRY_VERSION,
  DEFAULT_REGULATORY_PACK_BUNDLE,
  BOTSWANA_FOUNDATION_PACK_V1,
  BOTSWANA_FOUNDATION_PACK_V1_HASH,
  regulatoryPackBundleForMarket,
  regulatoryPackRegistryEntry
} from "../cloudflare/src/regulatory-pack-registry.js";
import {marketProfile,runtimeMarketProfile} from "../cloudflare/src/market-profile.js";

assert.match(REGULATORY_PACK_REGISTRY_VERSION,/2026-09-27/);

const bwProfile=marketProfile("BW");
assert.equal(bwProfile.rolloutStatus,"live");
assert.equal(bwProfile.runtimeEnabled,true);
assert.equal(bwProfile.regulatoryPack,"botswana-foundation-pack-v1");

const bw=regulatoryPackBundleForMarket("BW");
assert.ok(bw);
assert.equal(bw.marketCode,"BW");
assert.equal(bw.registryKey,bwProfile.regulatoryPack);
assert.equal(bw.pack,BOTSWANA_FOUNDATION_PACK_V1);
assert.equal(bw.hash,BOTSWANA_FOUNDATION_PACK_V1_HASH);
assert.equal(DEFAULT_REGULATORY_PACK_BUNDLE,bw);
assert.match(bw.pack.packKey,/^botswana-foundation-/);
assert.ok(Array.isArray(bw.pack.sources)&&bw.pack.sources.length>0);
assert.ok(Array.isArray(bw.pack.rules)&&bw.pack.rules.length>0);
assert.match(bw.hash,/^[a-f0-9]{64}$/i);

const naProfile=marketProfile("NA");
assert.equal(naProfile.rolloutStatus,"next");
assert.equal(naProfile.runtimeEnabled,false);
assert.equal(naProfile.regulatoryPack,null);
assert.equal(runtimeMarketProfile("NA"),null);
assert.equal(regulatoryPackBundleForMarket("NA"),null);
assert.equal(regulatoryPackBundleForMarket("ZA"),null);
assert.equal(regulatoryPackBundleForMarket("KE"),null);
assert.equal(regulatoryPackRegistryEntry("namibia-foundation-pack-v1"),null);

const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const registry=fs.readFileSync(new URL("../cloudflare/src/regulatory-pack-registry.js",import.meta.url),"utf8");
const homepage=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

assert.match(worker,/from "\.\/regulatory-pack-registry\.js"/);
assert.doesNotMatch(worker,/from "\.\/generated\/foundation-pack-v1\.js"/);
assert.match(registry,/from "\.\/generated\/foundation-pack-v1\.js"/);
assert.match(registry,/runtimeMarketProfile\(code\)/);
assert.match(registry,/DEFAULT_RUNTIME_MARKET_CODE/);
assert.match(homepage,/Live in Botswana · Namibia next/);
assert.doesNotMatch(homepage,/Live in Namibia/);

console.log("v169 regulatory pack registry: Botswana importable, Namibia next and fail-closed");
