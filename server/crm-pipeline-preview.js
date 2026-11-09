/**
 * Pure CRM pipeline summary. The authenticated caller must supply only tenant-scoped
 * records. This helper never queries, writes, sends messages or performs sales actions.
 * All monetary values are nonnegative integer thebe.
 */
const STAGES = Object.freeze(["new", "qualified", "proposal", "negotiation", "won", "lost"]);
export { STAGES as CRM_STAGES };
export function previewCrmPipeline({ tenantId, leads } = {}) {
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new TypeError("invalid_tenant");
  if (!Array.isArray(leads) || leads.length > 10000) throw new TypeError("invalid_leads");
  const byStage = Object.fromEntries(STAGES.map(stage => [stage, {count: 0, valueThebe: 0}]));
  let totalValueThebe = 0;
  const seen = new Set();
  for (const lead of leads) {
    if (!lead || typeof lead !== "object" || Array.isArray(lead) || lead.tenantId !== tenantId ||
        typeof lead.id !== "string" || !lead.id.trim() || !STAGES.includes(lead.stage) ||
        !Number.isSafeInteger(lead.valueThebe) || lead.valueThebe < 0 || seen.has(lead.id)) throw new TypeError("invalid_lead");
    seen.add(lead.id);
    const nextStage = byStage[lead.stage].valueThebe + lead.valueThebe;
    const nextTotal = totalValueThebe + lead.valueThebe;
    if (!Number.isSafeInteger(nextStage) || !Number.isSafeInteger(nextTotal)) throw new RangeError("amount_overflow");
    byStage[lead.stage].count++;
    byStage[lead.stage].valueThebe = nextStage;
    totalValueThebe = nextTotal;
  }
  for (const stage of STAGES) Object.freeze(byStage[stage]);
  return Object.freeze({ tenantId, previewOnly: true, currency: "BWP", totalLeads: leads.length,
    totalValueThebe, byStage: Object.freeze(byStage) });
}
