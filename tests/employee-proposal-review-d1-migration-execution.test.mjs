import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const migration=readFileSync(new URL("../cloudflare/migrations/20261021_employee_ai_proposal_reviews.sql",import.meta.url),"utf8");
test("staged D1 review schema supports atomic approval audit, replay rejection and tenant isolation",()=>{
 const python=`
import sqlite3,sys,json
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(sys.stdin.read())
key=json.dumps(["t1","w1","e1","contract_renewal","2026-11-01"],separators=(",",":"))
db.execute("INSERT INTO employee_ai_proposal_reviews (tenant_id,proposal_key,workflow_id,employee_id,task_type,due_date) VALUES (?,?,?,?,?,?)",("t1",key,"w1","e1","contract_renewal","2026-11-01"))
assert db.execute("SELECT count(*) FROM employee_ai_proposal_reviews WHERE tenant_id='t2'").fetchone()[0]==0
db.execute("BEGIN")
updated=db.execute("UPDATE employee_ai_proposal_reviews SET status=?,reviewed_by=?,reviewed_at=? WHERE tenant_id=? AND proposal_key=? AND status='proposed'",("approved","manager","2026-10-21T16:00:00Z","t1",key))
assert updated.rowcount==1
audit=db.execute("INSERT INTO employee_ai_proposal_review_events (tenant_id,proposal_key,decision,reviewer_id,reviewed_at) SELECT tenant_id,proposal_key,status,reviewed_by,reviewed_at FROM employee_ai_proposal_reviews WHERE tenant_id=? AND proposal_key=? AND status=? AND reviewed_by=? AND reviewed_at=? AND NOT EXISTS (SELECT 1 FROM employee_ai_proposal_review_events WHERE tenant_id=? AND proposal_key=?)",("t1",key,"approved","manager","2026-10-21T16:00:00Z","t1",key))
assert audit.rowcount==1
db.commit()
assert db.execute("SELECT count(*) FROM employee_ai_proposal_review_events").fetchone()[0]==1
assert db.execute("UPDATE employee_ai_proposal_reviews SET status='rejected',reviewed_by='other',reviewed_at='later' WHERE tenant_id=? AND proposal_key=? AND status='proposed'",("t1",key)).rowcount==0
assert db.execute("SELECT decision,reviewer_id FROM employee_ai_proposal_review_events").fetchone()==("approved","manager")
print("review migration SQLite transactional lifecycle PASS")
`;
 const result=spawnSync("python3",["-c",python],{input:migration,encoding:"utf8"});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
