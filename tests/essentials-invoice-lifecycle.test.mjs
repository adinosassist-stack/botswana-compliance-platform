import test from "node:test";
import assert from "node:assert/strict";
import {projectInvoiceLifecycle as project} from "../server/essentials-invoice-lifecycle.mjs";
const base={tenantId:"a",currency:"BWP",status:"issued",totalMinor:100000,allocatedMinor:0,dueDate:"2026-12-01"};
const run=(patch={},asOf="2026-11-26")=>project({tenantId:"a",invoice:{...base,...patch},asOf});
test("issued lifecycle",()=>{
 assert.equal(run().status,"unpaid");
 assert.equal(run({allocatedMinor:30000}).status,"partially_paid");
 assert.equal(run({allocatedMinor:30000}).outstandingMinor,70000);
 assert.equal(run({allocatedMinor:100000}).status,"paid");
 assert.equal(run({allocatedMinor:100000}).reminderEligible,false);
 assert.equal(run({},"2026-12-02").status,"overdue");
 assert.equal(run({},"2026-12-01").overdue,false);
 assert.equal(run({allocatedMinor:30000},"2026-12-02").partiallyPaid,true);
});
test("draft and void never collectible",()=>{
 for(const [status,expected] of [["draft","draft"],["void","cancelled"]]){
 const result=run({status});
 assert.equal(result.status,expected);
 assert.equal(result.outstandingMinor,0);
 assert.equal(result.reminderEligible,false);
 assert.throws(()=>run({status,allocatedMinor:1}));
 }
});
test("reject invalid ledger projections",()=>{
 for(const patch of [{tenantId:"b"},{currency:"USD"},{allocatedMinor:100001},{allocatedMinor:-1},{allocatedMinor:0.5},{totalMinor:0},{status:"paid"},{dueDate:"2026-02-30"}]) assert.throws(()=>run(patch));
 assert.throws(()=>run({},"invalid"));
});
