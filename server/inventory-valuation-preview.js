/**
 * Read-only inventory valuation preview for authenticated tenant-scoped records.
 * Does not reserve stock, perform checkout, update ledgers, or collect payments.
 * All prices are integer thebe. Caller must verify tenant authorization.
 */
export function previewInventory({tenantId, items} = {}) {
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new TypeError("invalid_tenant");
  if (!Array.isArray(items) || items.length > 10000) throw new TypeError("invalid_items");
  const seen = new Set();
  let stockValueThebe = 0;
  let retailValueThebe = 0;
  let lowStockCount = 0;
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || item.tenantId !== tenantId ||
        typeof item.sku !== "string" || !item.sku.trim() || item.sku.length > 120 ||
        seen.has(item.sku)) throw new TypeError("invalid_item");
    seen.add(item.sku);
    for (const field of ["quantity", "reorderPoint", "unitCostThebe", "unitPriceThebe"]) {
      if (!Number.isSafeInteger(item[field]) || item[field] < 0) throw new TypeError("invalid_" + field);
    }
    const cost = item.quantity * item.unitCostThebe;
    const retail = item.quantity * item.unitPriceThebe;
    if (![cost, retail, stockValueThebe + cost, retailValueThebe + retail].every(Number.isSafeInteger)) throw new RangeError("amount_overflow");
    stockValueThebe += cost;
    retailValueThebe += retail;
    if (item.quantity <= item.reorderPoint) lowStockCount++;
  }
  return Object.freeze({tenantId, previewOnly:true, currency:"BWP", skuCount:items.length,
    lowStockCount, stockValueThebe, retailValueThebe});
}
