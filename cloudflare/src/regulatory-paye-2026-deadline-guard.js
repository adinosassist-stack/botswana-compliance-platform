// Fail-closed PAYE promotion/execution guard for the Income Tax Act 2026 transition.
// This module never approves sources, changes regulatory records or rewrites historical obligations.
// Source review, definition hash, legal commencement/transition and maker-checker gates remain separate.
export const PAYE_2026_COMMENCEMENT="2026-07-01";
export const PAYE_REMITTANCE_RULE_KEY="bw.burs.paye.remittance.deadline";
const canonicalDate=value=>{
  const text=String(value??"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const d=new Date(`${text}T00:00:00Z`);
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===text?text:null;
};
function actionFor(row,action){
  if(action!==undefined)return action&&typeof action==="object"&&!Array.isArray(action)?action:{};
  try{const parsed=JSON.parse(String(row?.action_json??"{}"));return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{}}catch{return {}}
}
export function isPayeRemittanceRule(row,action){
  const a=actionFor(row,action);
  return String(row?.rule_key??"")===PAYE_REMITTANCE_RULE_KEY||
    String(a.obligation?.key??"")==="paye-monthly-remittance";
}
export function paye2026PromotionGuard(row,action){
  const a=actionFor(row,action);
  if(!isPayeRemittanceRule(row,a))return {ok:true};
  const to=canonicalDate(row?.effective_to);
  // A documented pre-commencement rule can be kept for historical records.
  // Malformed/missing dates must never be interpreted as a historical exemption.
  if(to&&to<PAYE_2026_COMMENCEMENT)return {ok:true,historicalOnly:true};
  const from=canonicalDate(row?.effective_from);
  if(!from||from<PAYE_2026_COMMENCEMENT||(row?.effective_to!=null&&!to)||(to!==null&&from>to))
    return {ok:false,error:"paye_2026_effective_period_review_required"};
  if(a.operationalization!=="monthly_end_plus_days"||a.dueDaysAfterPeriodEnd!==14)
    return {ok:false,error:"paye_2026_legacy_deadline_blocked"};
  const wording=[row?.title,row?.summary,a.obligation?.description].filter(x=>typeof x==="string").join(" ");
  if(/\b(?:15\s*(?:calendar\s+)?days?|fifteen\s+days?)\b/i.test(wording))
    return {ok:false,error:"paye_2026_legacy_deadline_copy_blocked"};
  return {ok:true};
}
