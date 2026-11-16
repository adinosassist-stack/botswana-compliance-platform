import test from "node:test";
import assert from "node:assert/strict";
import {createPostgresAgentApprovalHistoryReader} from "../server/agent-approval-history-postgres.js";
test("parameterized tenant and manager scope with minimal mapped rows",async()=>{
 let sql,params;
 const pool={async query(q,p){sql=q;params=p;return {rows:[{id:"abc",tenant_id:"tenant-a",actor_id:"owner-a",action:"draft_internal_task",status:"pending",consumed_at:null,created_at:"2026-11-10T00:00:00Z"}]};}};
 const rows=await createPostgresAgentApprovalHistoryReader(pool).listTenantApprovals({tenantId:"tenant-a",actorId:"owner-a",limit:10});
 assert.match(sql,/tenant_id=\$1/);assert.match(sql,/actor_id=\$2/);
 assert.match(sql,/limit \$4/);assert.deepEqual(params.slice(0,2),["tenant-a","owner-a"]);
 assert.deepEqual(rows,[{id:"abc",tenantId:"tenant-a",actorId:"owner-a",workflow:"employee_task_assignment",status:"requested",timestamp:"2026-11-10T00:00:00.000Z"}]);
});
test("consumed approvals are projected without exposing nonce",async()=>{
 const pool={async query(){return {rows:[{id:"abc",tenant_id:"tenant-a",actor_id:"owner-a",action:"draft_followup_message",status:"approved",consumed_at:"2026-11-10T01:00:00Z",created_at:"2026-11-10T00:00:00Z",nonce:"secret"}]};}};
 const [r]=await createPostgresAgentApprovalHistoryReader(pool).listTenantApprovals({tenantId:"tenant-a"});
 assert.equal(r.status,"consumed");assert.equal(r.nonce,undefined);
});
test("rejects invalid scope, unknown actions and unavailable storage",async()=>{
 const pool={async query(){return {rows:[{action:"money.transfer"}]};}};
 const reader=createPostgresAgentApprovalHistoryReader(pool);
 await assert.rejects(reader.listTenantApprovals({tenantId:"tenant-a"}),/unknown_history_action/);
 await assert.rejects(reader.listTenantApprovals({tenantId:"tenant-a",limit:51}),/invalid_history_scope/);
 assert.throws(()=>createPostgresAgentApprovalHistoryReader(null),/invalid_history_pool/);
});
