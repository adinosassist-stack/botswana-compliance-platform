import test from "node:test";
import assert from "node:assert/strict";
import {createAgentHistoryHostGuards} from "../server/agent-approval-history-host-guards.js";
const auth={id:"session",user_id:"user",tenant_id:"tenant"};
test("host guards require all trusted dependencies",()=>{
 assert.throws(()=>createAgentHistoryHostGuards(),/required/);
});
test("membership is checked against active nonrevoked DB session",async()=>{
 let sql,params;
 const guards=createAgentHistoryHostGuards({
  pool:{async query(q,p){sql=q;params=p;return {rows:[{one:1}]}}},
  allowedOrigin:async()=>true,rateLimit:async()=>true,auditAvailable:async()=>true
 });
 assert.equal(await guards.tenantMembership({},auth),true);
 assert.deepEqual(params,["session","user","tenant"]);
 assert.match(sql,/m.status='active'/);
 assert.match(sql,/s.revoked_at is null/);
 assert.match(sql,/s.session_generation=u.session_generation/);
});
test("missing session identity fails without DB query",async()=>{
 let queries=0;
 const guards=createAgentHistoryHostGuards({
  pool:{async query(){queries++;return {rows:[]}}},
  allowedOrigin:async()=>true,rateLimit:async()=>true,auditAvailable:async()=>true
 });
 assert.equal(await guards.tenantMembership({},{}),false);
 assert.equal(queries,0);
});
test("all injected security callbacks are strictly boolean",async()=>{
 const guards=createAgentHistoryHostGuards({
  pool:{async query(){return {rows:[]}}},
  allowedOrigin:async()=>"true",rateLimit:async()=>1,auditAvailable:async()=>null
 });
 assert.equal(await guards.originCheck({}),false);
 assert.equal(await guards.rateLimit({},auth),false);
 assert.equal(await guards.auditAvailable({},auth),false);
});
