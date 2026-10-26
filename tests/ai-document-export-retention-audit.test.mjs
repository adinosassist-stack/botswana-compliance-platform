import assert from "node:assert/strict";
import {test} from "node:test";
import {auditExpiredExportJobs} from "../server/ai-document-export-retention-audit.js";
const job={id:"j1",tenantId:"t1",actorId:"u1",expiresAt:900,objectKey:"ai-exports/t1/j1"};
test("audit classifies expiry without changing records",()=>{
 const rows=[job,{...job,id:"j2",objectKey:"ai-exports/t1/j2",expiresAt:1500},{...job,objectKey:"../secret"}];
 const before=JSON.stringify(rows);
 assert.deepEqual(auditExpiredExportJobs(rows,{now:1000}),{eligible:1,invalid:1,unexpired:1,inspected:3,readOnly:true});
 assert.equal(JSON.stringify(rows),before);
});
test("rejects unbounded scans and malformed timestamps",()=>{
 assert.throws(()=>auditExpiredExportJobs(Array(101).fill(job),{now:1000}));
 assert.throws(()=>auditExpiredExportJobs([job],{now:-1}));
 assert.equal(auditExpiredExportJobs([], {now:1000}).eligible,0);
});
