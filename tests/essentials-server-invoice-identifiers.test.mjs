import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsServerInvoiceIdentifiers} from "../server/essentials-server-invoice-identifiers.mjs";
const uuids=[
 "df5e70af-71be-4c7b-900c-dfe1048cf760",
 "c9beed62-315b-4ec1-9a24-b8badc0d8ac0"
];
test("generates two server-side safe UUIDv4-derived identifiers without sequencing",()=>{
 let i=0;const x=createEssentialsServerInvoiceIdentifiers({randomUUID:()=>uuids[i++]});
 assert.equal(x.invoiceReference,"ED_DF5E70AF71BE4C7B900CDFE1048CF760");
 assert.equal(x.draftId,"ess_c9beed62315b4ec19a24b8badc0d8ac0");
 assert.equal(i,2);assert.ok(Object.isFrozen(x));
});
test("fails closed when random generator unavailable or malicious",()=>{
 assert.throws(()=>createEssentialsServerInvoiceIdentifiers({randomUUID:null}),/secure_uuid_generator_required/);
 for(const bad of ["INV-1","00000000-0000-0000-0000-000000000000",
 "ffffffff-ffff-4fff-ffff-ffffffffffff' OR 1=1"]){
  assert.throws(()=>createEssentialsServerInvoiceIdentifiers({randomUUID:()=>bad}),/invalid_secure_uuid/);
 }
});
test("UUID collisions remain an explicit D1 UNIQUE constraint responsibility",()=>{
 const repeated=createEssentialsServerInvoiceIdentifiers({randomUUID:()=>uuids[0]});
 assert.equal(repeated.invoiceReference,"ED_DF5E70AF71BE4C7B900CDFE1048CF760");
 // No client-selected ID, no counter state and no auto-retry after a collision.
});
