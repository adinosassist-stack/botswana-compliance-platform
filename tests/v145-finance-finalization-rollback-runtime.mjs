import assert from "node:assert/strict";import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE agent_observation_claims(id TEXT PRIMARY KEY,tenant_id TEXT,persistent_task_id TEXT,scheduled_for TEXT,status TEXT,checkpoint_id TEXT,error_code TEXT,completed_at TEXT);
CREATE TABLE agent_persistent_tasks(id TEXT PRIMARY KEY,tenant_id TEXT,status TEXT,next_run_at TEXT,last_run_at TEXT,updated_at TEXT);
CREATE TABLE agent_observation_checkpoints(id TEXT PRIMARY KEY,tenant_id TEXT,persistent_task_id TEXT,snapshot_hash TEXT);
CREATE TABLE agent_persistent_task_events(id TEXT PRIMARY KEY,tenant_id TEXT,persistent_task_id TEXT,event_type TEXT,event_data TEXT);
CREATE TABLE audit_events(id TEXT PRIMARY KEY,tenant_id TEXT,event_type TEXT,entity_type TEXT,entity_id TEXT,event_data TEXT);
INSERT INTO agent_observation_claims VALUES('claim','tenant','task','2026-09-26T06:15:00.000Z','running',NULL,NULL,NULL);
INSERT INTO agent_persistent_tasks VALUES('task','tenant','active','2026-09-26T07:15:00.000Z',NULL,NULL);
`);
let failed=false;
try{
 db.exec("BEGIN");
 db.prepare("INSERT INTO agent_observation_checkpoints VALUES(?,?,?,?)").run("cp","tenant","task","hash");
 db.prepare("INSERT INTO agent_persistent_task_events VALUES(?,?,?,?,?)").run("ev","tenant","task","OBSERVATION_VERIFIED","{}");
 db.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?)").run("au","tenant","AGENT_FINANCE_OBSERVATION_VERIFIED","agent_observation_checkpoint","cp","{}");
 db.prepare("SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_observation_claims WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running') OR NOT EXISTS (SELECT 1 FROM agent_persistent_tasks WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?) THEN json_extract('invalid','$.') ELSE 1 END").get("claim","tenant","task","2026-09-26T06:15:00.000Z","task","tenant","2026-09-26T06:15:00.000Z");
 db.prepare("UPDATE agent_observation_claims SET status='completed',checkpoint_id=? WHERE id=?").run("cp","claim");
 db.prepare("UPDATE agent_persistent_tasks SET next_run_at=? WHERE id=?").run("2026-09-27T06:15:00.000Z","task");
 db.exec("COMMIT");
}catch{failed=true;try{db.exec("ROLLBACK")}catch{}}
assert.equal(failed,true,"stale task schedule must abort transaction");
for(const table of ["agent_observation_checkpoints","agent_persistent_task_events","audit_events"])assert.equal(Number(db.prepare(`SELECT count(*) c FROM ${table}`).get().c),0,`${table} must roll back`);
assert.equal(db.prepare("SELECT status FROM agent_observation_claims WHERE id='claim'").get().status,"running");
assert.equal(db.prepare("SELECT next_run_at FROM agent_persistent_tasks WHERE id='task'").get().next_run_at,"2026-09-26T07:15:00.000Z");
db.close();
console.log("v145 Finance finalization rollback runtime passed");
