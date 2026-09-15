import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";

const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
assert.match(finance,/async function appendLineageIfEntityUnchanged\(/,"finance connection mutations need a guarded lineage append");
assert.match(finance,/event_type IN \('CONNECTION_REGISTERED','CONNECTION_STATUS_CHANGED','CONNECTION_SYNC_COMPLETED'\)/,"CAS guard must cover every authoritative connection event type");
assert.match(finance,/expectedEntitySequence:connection\.lastSequence/,"connection actions must bind the append to the exact state they read");
assert.match(finance,/if\(!appended\)\{\s*const resolved=await getFinanceConnection/,"stale writers must re-resolve instead of appending a stale transition");
assert.match(finance,/resolved\?\.status===nextStatus.*replayed:true/s,"a concurrent identical transition may resolve as a harmless replay");
assert.match(finance,/finance_connection_state_conflict/,"a conflicting concurrent transition must fail closed");

// Prove the SQLite/D1 compare-and-set shape: once any connection event advances the
// entity sequence, an insert based on the stale observed sequence writes zero rows.
const db=new DatabaseSync(":memory:");
db.exec(`CREATE TABLE finance_lineage(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  actor_user_id TEXT,
  UNIQUE(tenant_id,sequence),
  UNIQUE(tenant_id,event_hash)
)`);
db.prepare("INSERT INTO finance_lineage VALUES(?,?,?,?,?,?,?,?,?,?)").run("r1","t1",1,"CONNECTION_REGISTERED","finance_connection","c1","{}","GENESIS","h1","u1");
const guarded=db.prepare(`INSERT INTO finance_lineage(id,tenant_id,sequence,event_type,entity_type,entity_id,payload_json,previous_hash,event_hash,actor_user_id)
  SELECT ?,?,?,?,?,?,?,?,?,?
  WHERE COALESCE((SELECT MAX(sequence) FROM finance_lineage WHERE tenant_id=? AND entity_type=? AND entity_id=? AND event_type IN ('CONNECTION_REGISTERED','CONNECTION_STATUS_CHANGED','CONNECTION_SYNC_COMPLETED')),0)=?`);
let result=guarded.run("s1","t1",2,"CONNECTION_STATUS_CHANGED","finance_connection","c1","{}","h1","h2","u1","t1","finance_connection","c1",1);
assert.equal(result.changes,1,"fresh observed connection sequence must be allowed to append once");
result=guarded.run("s2","t1",3,"CONNECTION_STATUS_CHANGED","finance_connection","c1","{}","h2","h3","u1","t1","finance_connection","c1",1);
assert.equal(result.changes,0,"stale observed connection sequence must not append a second event");
db.prepare("INSERT INTO finance_lineage VALUES(?,?,?,?,?,?,?,?,?,?)").run("sync1","t1",3,"CONNECTION_SYNC_COMPLETED","finance_connection","c1","{}","h2","h-sync","u1");
result=guarded.run("s3","t1",4,"CONNECTION_STATUS_CHANGED","finance_connection","c1","{}","h-sync","h4","u1","t1","finance_connection","c1",2);
assert.equal(result.changes,0,"a concurrent sync event must also invalidate an older connection observation");
result=guarded.run("s4","t1",4,"CONNECTION_STATUS_CHANGED","finance_connection","c1","{}","h-sync","h5","u1","t1","finance_connection","c1",3);
assert.equal(result.changes,1,"retrying from the newly observed connection sequence may proceed");

console.log("V82 finance connection transition CAS PASS");
