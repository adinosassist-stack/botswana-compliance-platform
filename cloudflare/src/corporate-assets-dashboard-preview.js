/**
 * Corporate Assets dashboard summary. Pure, read-only and deployment-inert.
 * Only accept rows already scoped by an authenticated backend to tenantId.
 * Currency values are nonnegative integer minor units (thebe).
 */
const categories = new Set(["fleet", "it", "machinery", "furniture", "other"]);
const statuses = new Set(["active", "maintenance", "written_off", "decommissioned"]);
function validMinor(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("invalid_amount");
  return value;
}
function add(a, b) {
  if (!Number.isSafeInteger(a + b)) throw new RangeError("amount_overflow");
  return a + b;
}
export function previewAssetDashboard({ tenantId, assets, asOfDate } = {}) {
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new TypeError("invalid_tenant");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate || "") ||
      Number.isNaN(Date.parse(asOfDate + "T00:00:00Z")) ||
      new Date(asOfDate + "T00:00:00Z").toISOString().slice(0, 10) !== asOfDate) throw new TypeError("invalid_date");
  if (!Array.isArray(assets) || assets.length > 10000) throw new TypeError("invalid_assets");
  const byCategory = Object.fromEntries([...categories].map(c => [c, 0]));
  const byStatus = Object.fromEntries([...statuses].map(s => [s, 0]));
  const seen = new Set();
  let acquisitionCostMinor = 0, bookValueMinor = 0, maintenanceDue = 0;
  for (const asset of assets) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset) ||
        asset.tenant_id !== tenantId || typeof asset.id !== "string" || !asset.id.trim() ||
        seen.has(asset.id) || !categories.has(asset.category) || !statuses.has(asset.status)) {
      throw new TypeError("invalid_asset");
    }
    seen.add(asset.id);
    acquisitionCostMinor = add(acquisitionCostMinor, validMinor(asset.acquisition_cost_minor));
    bookValueMinor = add(bookValueMinor, validMinor(asset.book_value_minor));
    if (asset.next_due_on != null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asset.next_due_on) ||
          Number.isNaN(Date.parse(asset.next_due_on + "T00:00:00Z")) ||
          new Date(asset.next_due_on + "T00:00:00Z").toISOString().slice(0,10) !== asset.next_due_on) throw new TypeError("invalid_due_date");
      if (asset.next_due_on <= asOfDate) maintenanceDue++;
    }
    byCategory[asset.category]++;
    byStatus[asset.status]++;
  }
  return Object.freeze({ tenantId, asOfDate, previewOnly: true, currency: "BWP", assetCount: assets.length,
    acquisitionCostMinor, bookValueMinor, maintenanceDue,
    byCategory: Object.freeze(byCategory), byStatus: Object.freeze(byStatus) });
}
