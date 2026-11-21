/** Batch B: pure job-costing calculations. No persistence, routes, or activation. */
const MAX = Number.MAX_SAFE_INTEGER;
function amount(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('invalid_' + field);
  return value;
}
function add(a,b) {
  const total = a + b;
  if (!Number.isSafeInteger(total) || total > MAX) throw new RangeError('amount_overflow');
  return total;
}
export function summarizeJobCosting(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('invalid_input');
  const revenueThebe = amount(input.revenueThebe, 'revenue');
  if (!Array.isArray(input.costs) || input.costs.length > 1000) throw new TypeError('invalid_costs');
  let totalCostThebe = 0;
  const categories = Object.create(null);
  for (const row of input.costs) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('invalid_cost');
    const category = row.category;
    if (typeof category !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(category)) throw new TypeError('invalid_category');
    const cost = amount(row.amountThebe, 'cost');
    totalCostThebe = add(totalCostThebe, cost);
    categories[category] = add(categories[category] || 0, cost);
  }
  const profitThebe = revenueThebe - totalCostThebe;
  return Object.freeze({ revenueThebe, totalCostThebe, profitThebe,
    marginBasisPoints: revenueThebe === 0 ? null : Math.round(profitThebe * 10000 / revenueThebe),
    categories: Object.freeze({...categories}) });
}
