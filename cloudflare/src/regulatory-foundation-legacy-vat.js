// Read-only detection of obsolete executable VAT deadlines before any foundation import.
// Never rewrites published rules or replaces independent legal/maker-checker review.
export const VAT_2026_COMMENCEMENT="2026-07-01";
export const VAT_LEGACY_25_DAY_KEY="bw.burs.vat.return-payment.25-days";
const dateIsBefore=(v,cutoff)=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))&&String(v)<cutoff;
export function isActiveLegacyVatRule(row,cutoff=VAT_2026_COMMENCEMENT){
  if(!row||!["approved","published"].includes(String(row.status||"")))return false;
  if(dateIsBefore(row.effective_to,cutoff))return false;
  let action={};try{action=JSON.parse(String(row.action_json||"{}"))}catch{}
  const isLegacyKey=String(row.rule_key||"")===VAT_LEGACY_25_DAY_KEY;
  const isLegacyAction=String(action.operationalization||"")==="vat_category_period"&&Number(action.dueDaysAfterPeriodEnd)===25;
  return isLegacyKey||isLegacyAction;
}
export async function inspectActiveLegacyVatRules(db){
  const r=await db.prepare("SELECT id,rule_key,status,effective_to,action_json FROM regulatory_rules WHERE status IN ('approved','published') ORDER BY rule_key,version DESC").all();
  const rules=(r.results||[]).filter(x=>isActiveLegacyVatRule(x)).map(x=>({
    ruleId:x.id,ruleKey:x.rule_key,status:x.status,effectiveTo:x.effective_to||null
  }));
  return {ok:rules.length===0,count:rules.length,rules};
}
export function publicActiveLegacyVatRules(result){
  return {ok:result.ok,count:result.count,rules:result.rules};
}
