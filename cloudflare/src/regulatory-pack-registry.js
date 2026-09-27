import {
  BOTSWANA_FOUNDATION_PACK_V1 as GENERATED_BOTSWANA_FOUNDATION_PACK_V1,
  BOTSWANA_FOUNDATION_PACK_V1_HASH as GENERATED_BOTSWANA_FOUNDATION_PACK_V1_HASH
} from "./generated/foundation-pack-v1.js";
import {DEFAULT_RUNTIME_MARKET_CODE,runtimeMarketProfile} from "./market-profile.js";

export const REGULATORY_PACK_REGISTRY_VERSION="2026-09-27.v1";

const frozen=value=>Object.freeze(value);

const PACKS=frozen({
  "botswana-foundation-pack-v1":frozen({
    marketCode:"BW",
    registryKey:"botswana-foundation-pack-v1",
    pack:GENERATED_BOTSWANA_FOUNDATION_PACK_V1,
    hash:GENERATED_BOTSWANA_FOUNDATION_PACK_V1_HASH
  })
});

export function regulatoryPackBundleForMarket(code=DEFAULT_RUNTIME_MARKET_CODE){
  const profile=runtimeMarketProfile(code);
  if(!profile?.regulatoryPack)return null;
  const bundle=PACKS[profile.regulatoryPack]||null;
  if(!bundle||bundle.marketCode!==profile.code)return null;
  return bundle;
}

export function regulatoryPackRegistryEntry(key){
  return PACKS[String(key||"").trim()]||null;
}

export const DEFAULT_REGULATORY_PACK_BUNDLE=regulatoryPackBundleForMarket(DEFAULT_RUNTIME_MARKET_CODE);
if(!DEFAULT_REGULATORY_PACK_BUNDLE)throw new Error("Default runtime market has no approved regulatory pack");

// Compatibility exports keep the existing Botswana import surface stable while
// moving the generated-pack dependency behind the country-aware registry.
export const BOTSWANA_FOUNDATION_PACK_V1=DEFAULT_REGULATORY_PACK_BUNDLE.pack;
export const BOTSWANA_FOUNDATION_PACK_V1_HASH=DEFAULT_REGULATORY_PACK_BUNDLE.hash;

export const __regulatoryPackRegistryTest=frozen({
  regulatoryPackBundleForMarket,
  regulatoryPackRegistryEntry
});
