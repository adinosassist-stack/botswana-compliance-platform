import test from "node:test";
import assert from "node:assert/strict";
import {createAgentHistoryReadiness as create} from "../server/agent-approval-history-readiness.js";
const a={tenant_id:"t",user_id:"u"};
test("requires shared limiter and database",()=>{
 assert.throws(()=>create(),/dependencies_required/);
});
test("audit readiness checks actual table presence",async()=>{
 let sql;
 const g=create({pool:{query:async q=>{sql=q;return {rows:[{audit_table:"audit_events"}]}}},
  distributedRateLimit:async()=>true});
 assert.equal(await g.auditHealth({},a),true);
 assert.match(sql,/to_regclass/);
});
test("audit readiness fails closed for missing table, invalid identity and DB errors",async()=>{
 const g=create({pool:{query:async()=>({rows:[{audit_table:null}]})},distributedRateLimit:async()=>true});
 assert.equal(await g.auditHealth({},a),false);
 assert.equal(await g.auditHealth({},{}),false);
 const bad=create({pool:{query:async()=>{throw Error("down")}},distributedRateLimit:async()=>true});
 assert.equal(await bad.auditHealth({},a),false);
});
test("shared limiter strictly requires affirmative decision and fails closed",async()=>{
 const g=create({pool:{query:async()=>({rows:[]})},distributedRateLimit:async()=>1});
 assert.equal(await g.rateLimit({},a),false);
 const bad=create({pool:{query:async()=>({rows:[]})},distributedRateLimit:async()=>{throw Error("down")}});
 assert.equal(await bad.rateLimit({},a),false);
 assert.equal(await bad.rateLimit({},{}),false);
});
