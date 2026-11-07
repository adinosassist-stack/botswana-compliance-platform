import assert from "node:assert/strict";
import test from "node:test";
import {inspectNamibiaWorkerBindings} from "../cloudflare/src/namibia-worker-binding-audit.js";
const production="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce";
const namibia=[
 "c8ce1dd7-6973-45e8-be7f-1b4f2b672312",
 "b45ebf26-429d-47ae-ae88-c404c8965c5b",
 "cb833f28-8ea6-4234-b183-c12c018aac15"
];
const settings=[
 {name:"bw-compliance-os",bindings:[{type:"d1",name:"DB",databaseId:production}]},
 {name:"bw-billing-staging",bindings:[{type:"d1",name:"DB",databaseId:"9d1b8852-4424-46e9-ba24-cdad5ced215f"}]},
 {name:"bw-compliance-os-ops-rehearsal",bindings:[{type:"d1",name:"DB",databaseId:"c5c232a8-8fe7-440c-81ba-021a44fd3fdd"}]},
 {name:"bw-corporate-assets-staging",bindings:[{type:"d1",name:"DB",databaseId:"e19f09de-3bb9-4021-b4f8-44df04c8aaa8"}]},
 {name:"bw-general-ai-staging",bindings:[{type:"d1",name:"DB",databaseId:"ff229eef-7724-49ae-9d68-d3a1db669b63"}]}
];
const args={scripts:settings,productionDbId:production,namibiaDbIds:namibia};
test("observed Cloudflare Worker settings have no disposable Namibia D1 binding",()=>{
 const r=inspectNamibiaWorkerBindings(args);
 assert.equal(r.ok,true);assert.equal(r.checkedScripts,5);
 assert.equal(r.noObservedNamibiaBindings,true);
 assert.deepEqual(r.namibiaBindingHits,[]);
 assert.equal(r.sessionPilotReady,false);
});
test("any Namibia binding is surfaced, not misrepresented as safe",()=>{
 const scripts=[...settings,{name:"mistaken-worker",bindings:[{type:"d1",name:"NA_CANDIDATE_DB",databaseId:namibia[0]}]}];
 const r=inspectNamibiaWorkerBindings({...args,scripts});
 assert.equal(r.noObservedNamibiaBindings,false);
 assert.equal(r.namibiaBindingHits[0].databaseId,namibia[0]);
 assert.equal(r.sessionPilotReady,false);
});
test("missing production binding, unknown IDs and incomplete results fail closed",()=>{
 assert.equal(inspectNamibiaWorkerBindings({...args,scripts:settings.slice(1)}).ok,false);
 assert.equal(inspectNamibiaWorkerBindings({...args,namibiaDbIds:[namibia[0],namibia[0],namibia[2]]}).ok,false);
 assert.equal(inspectNamibiaWorkerBindings({...args,scripts:[...settings,{name:"bad",bindings:[{type:"d1",name:"DB"}]}]}).ok,false);
 assert.equal(inspectNamibiaWorkerBindings({...args,scripts:[...settings,settings[0]]}).ok,false);
});
