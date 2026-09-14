import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec(fs.readFileSync('cloudflare/schema.sql','utf8'));
const run=(sql,...args)=>db.prepare(sql).run(...args);
const get=(sql,...args)=>db.prepare(sql).get(...args);
const ok=(v,m)=>{if(!v)throw new Error(`FAIL: ${m}`)};

run("INSERT INTO tenants(id,name) VALUES('t1','Synthetic')");
run("INSERT INTO users(id,email) VALUES('u1','synthetic@example.test')");
run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','u1','owner','active')");
run("INSERT INTO deletion_requests(id,tenant_id,user_id,requested_by_user_id,status,processing_token) VALUES('dr1','t1','u1','u1','processing','claim-1')");

const fingerprint='fp-t1';
db.exec('BEGIN');
try{
  db.prepare(`INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged)
    SELECT ?,?,'v2',?,?,? WHERE EXISTS(SELECT 1 FROM deletion_requests WHERE id=? AND tenant_id=? AND status='processing' AND processing_token=?)`)
    .run('dr1',fingerprint,0,0,1,'dr1','t1','claim-1');
  db.prepare(`DELETE FROM users WHERE id IN (
    SELECT m.user_id FROM memberships m WHERE m.tenant_id=? AND NOT EXISTS (
      SELECT 1 FROM memberships other WHERE other.user_id=m.user_id AND other.tenant_id<>m.tenant_id
    )
  )`).run('t1');
  db.prepare("DELETE FROM tenants WHERE id=? AND EXISTS(SELECT 1 FROM deletion_tombstones WHERE request_id=? AND tenant_fingerprint=?)")
    .run('t1','dr1',fingerprint);
  db.exec('COMMIT');
}catch(e){
  db.exec('ROLLBACK');
  throw e;
}

ok(!get("SELECT 1 x FROM users WHERE id='u1'"),'synthetic user removed');
ok(!get("SELECT 1 x FROM tenants WHERE id='t1'"),'synthetic tenant removed');
ok(!get("SELECT 1 x FROM deletion_requests WHERE id='dr1'"),'PII deletion request removed by cascade');
ok(!!get("SELECT 1 x FROM deletion_tombstones WHERE request_id='dr1' AND tenant_fingerprint='fp-t1'"),'minimal tombstone survives');

run("INSERT INTO tenants(id,name) VALUES('t2','Claim Lost')");
run("INSERT INTO users(id,email) VALUES('u2','claimlost@example.test')");
run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t2','u2','owner','active')");
run("INSERT INTO deletion_requests(id,tenant_id,user_id,requested_by_user_id,status,processing_token) VALUES('dr2','t2','u2','u2','processing','other-claim')");
const inserted=db.prepare(`INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged)
  SELECT ?,?,'v2',?,?,? WHERE EXISTS(SELECT 1 FROM deletion_requests WHERE id=? AND tenant_id=? AND status='processing' AND processing_token=?)`)
  .run('dr2','fp-t2',0,0,1,'dr2','t2','stale-claim');
ok(inserted.changes===0,'stale processing claim cannot mint tombstone');
ok(!!get("SELECT 1 x FROM tenants WHERE id='t2'"),'claim-lost tenant preserved');
ok(!!get("SELECT 1 x FROM users WHERE id='u2'"),'claim-lost user preserved');

console.log('V78 deletion tombstone ordering regression: PASS');
