// Read-only detection of obsolete VAT deadlines, plus a fail-closed runtime guard.
// Neither function changes source approval, rule history or customer obligations.
export const VAT_2026_COMMENCEMENT="2026-07-01";
export const VAT_LEGACY_25_DAY_KEY="bw.burs.vat.return-payment.25-days";
const dateIsBefore=(v,cutoff)=>{const value=String(v||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&value<cutoff;};
export function isLegacyVat25DayDefinition(row){
  if(!row)return false;
  let action={};try{action=JSON.parse(String(row.action_json||"{}"))}catch{}
  return String(row.rule_key||"")===VAT_LEGACY_25_DAY_KEY||
    (String(action.operationalization||"")==="vat_category_period"&&Number(action.dueDaysAfterPeriodEnd)===25);
}
export function isActiveLegacyVatRule(row,cutoff=VAT_2026_COMMENCEMENT){
  return !!row&&["approved","published"].includes(String(row.status||""))&&
    !dateIsBefore(row.effective_to,cutoff)&&isLegacyVat25DayDefinition(row);
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
