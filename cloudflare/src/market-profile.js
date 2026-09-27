export const THEBE_MARKET_PROFILE_VERSION="2026-09-27.v2";

const frozen=value=>Object.freeze(value);
const cleanCode=value=>String(value||"").trim().toUpperCase();
const present=value=>String(value??"").trim().length>0;

export const DEFAULT_RUNTIME_MARKET_CODE="BW";

export const THEBE_MARKETS=frozen({
  BW:frozen({
    code:"BW",
    country:"Botswana",
    rolloutStatus:"live",
    runtimeEnabled:true,
    currency:"BWP",
    currencySymbol:"P",
    locale:"en-BW",
    timeZone:"Africa/Gaborone",
    regulatoryPack:"botswana-foundation-pack-v1",
    moneyPrefixTokens:frozen(["P","BWP"]),
    moneySuffixTokens:frozen(["pula","BWP"])
  }),
  NA:frozen({
    code:"NA",
    country:"Namibia",
    rolloutStatus:"next",
    runtimeEnabled:false,
    currency:"NAD",
    currencySymbol:"N$",
    locale:"en-NA",
    timeZone:"Africa/Windhoek",
    regulatoryPack:null,
    moneyPrefixTokens:frozen(["N$","NAD"]),
    moneySuffixTokens:frozen(["NAD","Namibian dollar","Namibian dollars"])
  })
});

export function marketProfile(code=DEFAULT_RUNTIME_MARKET_CODE){
  return THEBE_MARKETS[cleanCode(code)]||null;
}

function activationBlockers(profile){
  if(!profile)return frozen(["market_not_registered"]);
  const blockers=[];
  if(profile.runtimeEnabled!==true)blockers.push("runtime_disabled");
  if(profile.rolloutStatus!=="live")blockers.push("rollout_not_live");
  if(!present(profile.code)||!present(profile.country))blockers.push("market_identity_incomplete");
  if(!present(profile.currency)||!present(profile.currencySymbol))blockers.push("currency_config_incomplete");
  if(!present(profile.locale)||!present(profile.timeZone))blockers.push("locale_config_incomplete");
  if(!present(profile.regulatoryPack))blockers.push("regulatory_pack_missing");
  if(!Array.isArray(profile.moneyPrefixTokens)||profile.moneyPrefixTokens.length===0||!Array.isArray(profile.moneySuffixTokens)||profile.moneySuffixTokens.length===0){
    blockers.push("money_tokens_missing");
  }
  return frozen(blockers);
}

export function marketActivationReadiness(code=DEFAULT_RUNTIME_MARKET_CODE){
  const normalized=cleanCode(code);
  const profile=marketProfile(normalized);
  const blockers=activationBlockers(profile);
  return frozen({
    marketCode:profile?.code||normalized||null,
    registered:!!profile,
    ready:blockers.length===0,
    rolloutStatus:profile?.rolloutStatus||null,
    runtimeEnabled:profile?.runtimeEnabled===true,
    regulatoryPack:profile?.regulatoryPack||null,
    blockers
  });
}

export function runtimeMarketProfile(code=DEFAULT_RUNTIME_MARKET_CODE){
  const profile=marketProfile(code);
  return marketActivationReadiness(code).ready?profile:null;
}

export function marketRollout(){
  return frozen({
    live:frozen(Object.values(THEBE_MARKETS).filter(item=>runtimeMarketProfile(item.code)?.rolloutStatus==="live").map(item=>item.code)),
    next:frozen(Object.values(THEBE_MARKETS).filter(item=>item.rolloutStatus==="next").map(item=>item.code))
  });
}

export function marketBusinessDate(now=new Date(),code=DEFAULT_RUNTIME_MARKET_CODE){
  const profile=runtimeMarketProfile(code)||runtimeMarketProfile(DEFAULT_RUNTIME_MARKET_CODE);
  try{
    return new Intl.DateTimeFormat("en-CA",{
      timeZone:profile.timeZone,
      year:"numeric",
      month:"2-digit",
      day:"2-digit"
    }).format(now);
  }catch{
    return now.toISOString().slice(0,10);
  }
}

export function formatMarketMajor(value,{marketCode=DEFAULT_RUNTIME_MARKET_CODE,minimumFractionDigits=0,maximumFractionDigits=2}={}){
  const profile=runtimeMarketProfile(marketCode)||runtimeMarketProfile(DEFAULT_RUNTIME_MARKET_CODE);
  const amount=Number(value||0);
  return `${profile.currencySymbol}${amount.toLocaleString(profile.locale,{minimumFractionDigits,maximumFractionDigits})}`;
}

export function formatMarketMinor(value,{marketCode=DEFAULT_RUNTIME_MARKET_CODE,minimumFractionDigits=2,maximumFractionDigits=2}={}){
  return formatMarketMajor(Number(value||0)/100,{marketCode,minimumFractionDigits,maximumFractionDigits});
}

export function marketMoneyTokens(code=DEFAULT_RUNTIME_MARKET_CODE){
  const profile=runtimeMarketProfile(code);
  if(!profile)return null;
  return frozen({
    prefix:profile.moneyPrefixTokens,
    suffix:profile.moneySuffixTokens
  });
}

export const __marketProfileTest=frozen({
  cleanCode,
  activationBlockers,
  marketProfile,
  marketActivationReadiness,
  runtimeMarketProfile,
  marketRollout,
  marketBusinessDate,
  formatMarketMajor,
  formatMarketMinor,
  marketMoneyTokens
});
