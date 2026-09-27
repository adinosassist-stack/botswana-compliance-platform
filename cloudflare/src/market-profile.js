export const THEBE_MARKET_PROFILE_VERSION="2026-09-27.v1";

const frozen=value=>Object.freeze(value);
const cleanCode=value=>String(value||"").trim().toUpperCase();

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

export function runtimeMarketProfile(code=DEFAULT_RUNTIME_MARKET_CODE){
  const profile=marketProfile(code);
  return profile?.runtimeEnabled===true?profile:null;
}

export function marketRollout(){
  return frozen({
    live:frozen(Object.values(THEBE_MARKETS).filter(item=>item.runtimeEnabled===true&&item.rolloutStatus==="live").map(item=>item.code)),
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
  marketProfile,
  runtimeMarketProfile,
  marketRollout,
  marketBusinessDate,
  formatMarketMajor,
  formatMarketMinor,
  marketMoneyTokens
});
