import test from "node:test";
import assert from "node:assert/strict";
import {assertEssentialsDraftAccess} from "../server/essentials-access-boundary.mjs";
const principal={userId:"user-a",tenantId:"tenant-a",permissions:["invoice:draft:create"]};
test("accepts a matching tenant and explicitly granted permission",()=>{
 assert.equal(assertEssentialsDraftAccess({principal,tenantId:"tenant-a",recordTenantId:"tenant-a",permission:"invoice:draft:create"}).authorized,true);
});
test("rejects cross-tenant records and mismatched session tenant",()=>{
 assert.throws(()=>assertEssentialsDraftAccess({principal,tenantId:"tenant-a",recordTenantId:"tenant-b",permission:"invoice:draft:create"}),/tenant_access_denied/);
 assert.throws(()=>assertEssentialsDraftAccess({principal,tenantId:"tenant-b",recordTenantId:"tenant-b",permission:"invoice:draft:create"}),/tenant_access_denied/);
});
test("rejects permissions not granted to principal",()=>{
 assert.throws(()=>assertEssentialsDraftAccess({principal,tenantId:"tenant-a",recordTenantId:"tenant-a",permission:"template:edit"}),/permission_denied/);
});
