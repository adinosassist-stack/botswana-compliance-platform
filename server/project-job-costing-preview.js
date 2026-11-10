/**
 * Read-only project job-costing foundation.
 * Inputs must be supplied by an authenticated, tenant-scoped caller.
 * No database writes, invoice issuance, payroll, payments or AI execution.
 * Monetary inputs are integer minor units (thebe), avoiding floating-point currency drift.
 */
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("invalid_" + label);
  return value;
}
function sum(items, field) {
  if (!Array.isArray(items) || items.length > 1000) throw new TypeError("invalid_items");
  return items.reduce((total, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("invalid_item");
    const amount = integer(item[field], field);
    const next = total + amount;
    if (!Number.isSafeInteger(next)) throw new RangeError("amount_overflow");
    return next;
  }, 0);
}
export function previewJobCosting({ tenantId, projectId, revenueThebe, materials = [], labour = [], subcontractors = [], otherCosts = [] } = {}) {
  if (typeof tenantId !== "string" || !tenantId.trim() || typeof projectId !== "string" || !projectId.trim()) {
    throw new TypeError("invalid_identity");
  }
  const revenue = integer(revenueThebe, "revenue");
  const materialsThebe = sum(materials, "costThebe");
  const labourThebe = sum(labour, "costThebe");
  const subcontractorsThebe = sum(subcontractors, "costThebe");
  const otherThebe = sum(otherCosts, "costThebe");
  const totalCostThebe = [materialsThebe, labourThebe, subcontractorsThebe, otherThebe].reduce((a,b) => {
    if (!Number.isSafeInteger(a + b)) throw new RangeError("amount_overflow");
    return a + b;
  }, 0);
  const profitThebe = revenue - totalCostThebe;
  return Object.freeze({
    tenantId, projectId, previewOnly: true, currency: "BWP",
    revenueThebe: revenue, materialsThebe, labourThebe, subcontractorsThebe, otherThebe,
    totalCostThebe, profitThebe,
    marginPercent: revenue === 0 ? null : Math.round((profitThebe / revenue) * 10000) / 100
  });
}
