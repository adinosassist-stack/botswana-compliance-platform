import assert from "node:assert/strict";
import test from "node:test";
import {auditNamibiaD1Inventory} from "../cloudflare/src/namibia-d1-inventory-audit.js";
import {marketActivationReadiness} from "../cloudflare/src/market-profile.js";
const prod="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce";
const compliance="c8ce1dd7-6973-45e8-be7f-1b4f2b672312";
const source="b45ebf26-429d-47ae-ae88-c404c8965c5b";
const inventory=[
 {name:"bw-compliance-os",id:prod},
 {name:"na-compliance-disposable-20261107",id:compliance},
 {name:"na-source-review-disposable-v2-20261107",id:source}
];
const input={databases:inventory,expectedProductionId:prod,
 expectedComplianceId:compliance,expectedSourceId:source};
test("physical inventory matches observed D1 identities but missing Namibia sessions blocks pilot",()=>{
 const result=auditNamibiaD1Inventory(input);
 assert.equal(result.ok,true);assert.equal(result.inventoryMatched,true);
 assert.equal(result.sessionIsolated,false);assert.equal(result.pilotReady,false);
 assert.ok(result.blockers.includes("dedicated_namibia_session_database_missing"));
 assert.equal(marketActivationReadiness("NA").ready,false);
});
test("rejects stale UUID, swapped name, collisions, duplicate and untrusted inventory",()=>{
 for(const candidate of [
  {...input,expectedComplianceId:prod},
  {...input,expectedSourceId:compliance},
  {...input,databases:inventory.slice(1)},
  {...input,databases:[...inventory,{...inventory[0]}]},
  {...input,databases:[...inventory,{name:"other-d1",id:prod}]},
  {...input,databases:[...inventory.slice(0,1),{...inventory[1],id:source},inventory[2]]},
  {...input,databases:null}
 ])assert.equal(auditNamibiaD1Inventory(candidate).ok,false);
});
test("inventing a session DB ID cannot bypass inventory check",()=>{
 assert.equal(auditNamibiaD1Inventory({...input,sessionDbId:prod}).sessionIsolated,false);
 assert.equal(auditNamibiaD1Inventory({...input,sessionDbId:"00000000-0000-0000-0000-000000000000"}).sessionIsolated,false);
 const dedicated="ab123456-1234-1234-1234-123456789abc";
 const outcome=auditNamibiaD1Inventory({...input,sessionDbId:dedicated,
   databases:[...inventory,{name:"na-sessions-disposable-only",id:dedicated}]});
 assert.equal(outcome.sessionIsolated,true);
 assert.equal(outcome.pilotReady,false);
});
