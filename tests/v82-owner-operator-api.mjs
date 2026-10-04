import assert from "node:assert/strict";
import { handleOwnerOperatorRequest, isOwnerOperatorPath } from "../cloudflare/src/owner-operator-api.js";

const req=(path,{method="GET",body,headers={}}={})=>new Request("https://thebe.test"+path,{method,headers:{"content-type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)});
const read=async response=>({status:response.status,body:await response.json()});

assert.equal(isOwnerOperatorPath("/api/ai/operator/queue"),true);
assert.equal(isOwnerOperatorPath("/api/ai/advisor"),false);

let out=await read(await handleOwnerOperatorRequest(req("/api/ai/operator/capabilities"),{auth:null}));
assert.equal(out.status,401);

out=await read(await handleOwnerOperatorRequest(req("/api/ai/operator/capabilities"),{auth:{tenant_id:"t1",role:"auditor"}}));
assert.equal(out.status,403);

out=await read(await handleOwnerOperatorRequest(req("/api/ai/operator/capabilities"),{auth:{tenant_id:"t1",role:"owner"}}));
assert.equal(out.status,200);
assert.equal(out.body.mode,"governed_persistent_operator");
assert.ok(out.body.approvalGated.includes("payments"));

out=await read(await handleOwnerOperatorRequest(req("/api/ai/operator/route",{method:"POST",body:{domain:"finance",intent:"read"}}),{auth:{tenant_id:"t1",role:"owner"}}));
assert.equal(out.status,200);
assert.equal(out.body.specialist.key,"finance");
assert.equal(out.body.actionKey,"financial_position.read");

out=await read(await handleOwnerOperatorRequest(req("/api/ai/operator/route",{method:"POST",body:{domain:"management",intent:"read"}}),{auth:{tenant_id:"t1",role:"reviewer"}}));
assert.equal(out.status,403);
assert.equal(out.body.code,"role_forbidden");

out=await read(await handleOwnerOperatorRequest(req("/api/ai/operator/queue",{method:"POST",body:{signals:[{id:"a",domain:"compliance",severity:"critical",overdue:true,prepare:true,title:"Deadline"}]}}),{auth:{tenant_id:"t1",role:"owner"}}));
assert.equal(out.status,200);
assert.equal(out.body.items.length,1);
assert.equal(out.body.items[0].status,"ready_for_review");
assert.equal(out.body.items[0].externalSideEffect,false);

out=await read(await handleOwnerOperatorRequest(req("/api/ai/operator/queue",{method:"POST",body:{signals:[]}}),{auth:{tenant_id:"t1",role:"reviewer"}}));
assert.equal(out.status,403);

const huge="x".repeat(5000);
out=await read(await handleOwnerOperatorRequest(req("/api/ai/operator/route",{method:"POST",body:{domain:"finance",note:huge}}),{auth:{tenant_id:"t1",role:"owner"}}));
assert.equal(out.status,413);

console.log("Owner Operator HTTP adapter tests passed");
