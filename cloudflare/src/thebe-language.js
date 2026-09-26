import {listBusinessMemory} from "./business-memory.js";

export const THEBE_LANGUAGE_VERSION="2026-09-26.v160";
export const SUPPORTED_THEBE_LANGUAGES=Object.freeze([
  Object.freeze({key:"english",label:"English"}),
  Object.freeze({key:"setswana",label:"Setswana"}),
  Object.freeze({key:"sekalaka",label:"Sekalaka"})
]);

const KEYS=new Set(SUPPORTED_THEBE_LANGUAGES.map(item=>item.key));
const ALIASES=Object.freeze({
  en:"english",english:"english",
  tn:"setswana",tswana:"setswana",setswana:"setswana",
  sekalaka:"sekalaka"
});
const clean=(value,max=120)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const frozen=value=>Object.freeze(value);

export function normalizeThebeLanguage(value){
  const raw=clean(value,80).toLowerCase(),key=ALIASES[raw]||raw;
  return KEYS.has(key)?key:null;
}
export function thebeLanguageLabel(key){
  return SUPPORTED_THEBE_LANGUAGES.find(item=>item.key===normalizeThebeLanguage(key))?.label||null;
}
export function languagePreferenceFromMemory(memory){
  const items=Array.isArray(memory?.items)?memory.items:[];
  const row=items.find(item=>item?.namespace==="language"&&item?.key==="primary");
  const primary=normalizeThebeLanguage(row?.value);
  return frozen({
    mode:primary?"preferred":"auto",
    primary,
    label:thebeLanguageLabel(primary),
    source:primary?"owner_confirmed_business_memory":"auto_mirror",
    authoritative:false
  });
}
export async function loadThebeLanguagePreference(env,tenantId){
  try{return languagePreferenceFromMemory(await listBusinessMemory(env,tenantId))}
  catch{return languagePreferenceFromMemory(null)}
}
export function thebeLanguageGuidance(preference={},channel="text"){
  const primary=normalizeThebeLanguage(preference?.primary);
  const channelName=clean(channel,40)||"text";
  const lines=[
    "Support English, Setswana, and Sekalaka.",
    "Mirror the language the user is actually using; an owner preference is a default, not permission to ignore an explicit language change.",
    "Keep legal, tax, accounting, compliance and other technical terms precise; retain or briefly explain the English term when translation could reduce precision.",
    "For Setswana or Sekalaka, never invent vocabulary. If wording or intent is uncertain, state the uncertainty briefly and use a clearer supported language rather than fabricating a translation.",
    `Apply this language policy consistently on the ${channelName} channel without changing permissions, approvals, evidence standards, or execution authority.`
  ];
  if(primary)lines.push(`The owner-confirmed preferred language is ${thebeLanguageLabel(primary)}. Start there when appropriate, while still mirroring the user's current language.`);
  return frozen(lines);
}
export function thebeLanguagePrompt(preference={},channel="text"){
  return thebeLanguageGuidance(preference,channel).join(" ");
}
export function deterministicLanguagePolicy(preference={}){
  const primary=normalizeThebeLanguage(preference?.primary);
  if(!primary)return frozen({requested:null,render:"english",fallback:false,reason:"auto_mirror_unavailable_without_language_model"});
  if(primary==="english")return frozen({requested:"english",render:"english",fallback:false,reason:null});
  if(primary==="setswana")return frozen({requested:"setswana",render:"setswana",fallback:false,reason:null,technicalTermsMayRemainEnglish:true});
  return frozen({
    requested:"sekalaka",
    render:"english",
    fallback:true,
    reason:"deterministic_sekalaka_translation_not_claimed_without_language_model",
    technicalTermsMayRemainEnglish:true
  });
}
export function deterministicLanguageNotice(preference={}){
  const policy=deterministicLanguagePolicy(preference);
  if(!policy.fallback)return null;
  return "Sekalaka preference is active. This deterministic finance text stays in English where Thebe cannot verify a safe Sekalaka rendering; open-ended Thebe chat and voice may answer in Sekalaka when confident.";
}

export const __thebeLanguageTest=frozen({
  normalizeThebeLanguage,
  thebeLanguageLabel,
  languagePreferenceFromMemory,
  thebeLanguageGuidance,
  thebeLanguagePrompt,
  deterministicLanguagePolicy,
  deterministicLanguageNotice
});
