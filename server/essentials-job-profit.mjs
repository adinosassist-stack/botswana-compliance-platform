import {previewJobCosting} from "./project-job-costing-preview.js";
/** Read-only job profitability comparison; never equate invoices with cleared cash. */
export function previewEssentialsJobProfit({tenantId,projectId,quotedRevenueThebe,actualRevenueThebe,estimatedCosts={},actualCosts={}}={}){
 const map=(costs)=>{if(!costs||typeof costs!=="object"||Array.isArray(costs))throw new TypeError("invalid_costs");const result={};for(const key of ["materials","labour","subcontractors","otherCosts"]){const value=costs[key]??0;if(!Number.isSafeInteger(value)||value<0)throw new TypeError("invalid_cost");result[key]=[{costThebe:value}];}return result;};
 const estimate=previewJobCosting({tenantId,projectId,revenueThebe:quotedRevenueThebe,...map(estimatedCosts)});
 const actual=previewJobCosting({tenantId,projectId,revenueThebe:actualRevenueThebe,...map(actualCosts)});
 const profitVarianceThebe=actual.profitThebe-estimate.profitThebe;
 if(!Number.isSafeInteger(profitVarianceThebe))throw new RangeError("amount_overflow");
 return Object.freeze({tenantId,projectId,currency:"BWP",estimatedProfitThebe:estimate.profitThebe,actualProfitThebe:actual.profitThebe,profitVarianceThebe,estimatedMarginPercent:estimate.marginPercent,actualMarginPercent:actual.marginPercent,previewOnly:true,cashCollectedNotInferred:true});
}
