import test from "node:test";
import assert from "node:assert/strict";
import {prepareAuthorizedInvoiceDraft} from "../server/essentials-invoice-draft-adapter.mjs";
const principal={userId:"owner-1",tenantId:"tenant-a",permissions:["invoice:draft:create"]};
const quotation={companyId:"tenant-a",customerId:"customer-1",reference:"Q-1",items:[{description:"Stone",quantity:1,unitMinor:10000,lineMinor:10000}],discountMinor:0,totalMinor:10000};
test("prepares a tenant-bound draft for transactional persistence",()=>{
 const x=prepareAuthorizedInvoiceDraft({principal,tenantId:"tenant-a",quotation,invoiceReference:"INV-1",createdAt:"2026-11-18"});
 assert.equal(x.draft.totalMinor,10000);assert.equal(x.requiresAtomicInsert,true);assert.equal(x.previewOnly,true);
});
test("rejects cross-tenant quotation before conversion",()=>{
 assert.throws(()=>prepareAuthorizedInvoiceDraft({principal,tenantId:"tenant-a",quotation:{...quotation,companyId:"tenant-b"},invoiceReference:"INV-1",createdAt:"2026-11-18"}),/tenant_access_denied/);
});
test("rejects principal without invoice permission",()=>{
 assert.throws(()=>prepareAuthorizedInvoiceDraft({principal:{...principal,permissions:[]},tenantId:"tenant-a",quotation,invoiceReference:"INV-1",createdAt:"2026-11-18"}),/permission_denied/);
});

test("uses the canonical invoice reference in the returned tenant-scoped uniqueness key",()=>{
 const x=prepareAuthorizedInvoiceDraft({principal,tenantId:"tenant-a",quotation,invoiceReference:" INV-1 ",createdAt:"2026-11-18"});
 assert.equal(x.draft.invoiceReference,"INV-1");
 assert.equal(x.uniquenessKey,"tenant-a:INV-1");
 const y=prepareAuthorizedInvoiceDraft({principal,tenantId:"tenant-a",quotation,invoiceReference:"INV-1",createdAt:"2026-11-18"});
 assert.equal(x.uniquenessKey,y.uniquenessKey);
});
