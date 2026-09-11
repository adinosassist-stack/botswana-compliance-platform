import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
let checks=0;const ok=(v,m)=>{checks++;if(!v)throw new Error(`FAIL: ${m}`)};
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec(fs.readFileSync('cloudflare/schema.sql','utf8'));
const run=(sql,...args)=>db.prepare(sql).run(...args);
const get=(sql,...args)=>db.prepare(sql).get(...args);
run("INSERT INTO tenants(id,name) VALUES('t1','Target'),('t2','Other')");
run("INSERT INTO users(id,email) VALUES('u1','owner1@example.test'),('u2','shared@example.test'),('u3','other@example.test')");
run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','u1','owner','active'),('t1','u2','reviewer','active'),('t2','u2','owner','active'),('t2','u3','reviewer','active')");
run("INSERT INTO deletion_requests(id,tenant_id,user_id,requested_by_user_id,status) VALUES('dr1','t1','u1','u1','approved')");
run("INSERT INTO evidence(id,tenant_id,display_name,deletion_status) VALUES('e1','t1','proof.pdf','deleted'),('e2','t2','keep.pdf','retained')");
run("INSERT INTO audit_events(tenant_id,event_type) VALUES('t1','DELETE_ME'),('t2','KEEP_ME')");
run("INSERT INTO ai_usage(tenant_id,feature,units,cost_estimate) VALUES('t1','x',1,0),('t2','x',1,0)");
run("INSERT INTO payment_return_events(id,tenant_id,provider,return_type) VALUES('pr1','t1','dpo','success'),('pr2','t2','dpo','success')");
run("INSERT INTO payment_integrity_anomalies(id,tenant_id,anomaly_type) VALUES('pa1','t1','duplicate_provider_token'),('pa2','t2','duplicate_provider_token')");
run("INSERT INTO partner_clients(partner_tenant_id,client_tenant_id) VALUES('t1','t2'),('t2','t1')");
run("INSERT INTO partner_tasks(id,partner_tenant_id,client_tenant_id,source_type,title) VALUES('pt1','t1','t2','manual','delete'),('pt2','t2','t1','manual','delete too')");
run("INSERT INTO partner_task_events(partner_task_id,partner_tenant_id,client_tenant_id,event_type) VALUES('pt1','t1','t2','CREATED'),('pt2','t2','t1','CREATED')");
run("INSERT INTO partner_access_events(partner_tenant_id,client_tenant_id,event_type) VALUES('t1','t2','read'),('t2','t1','read')");
run("INSERT INTO partner_invites(id,partner_tenant_id,email,invite_token_hash,expires_at,accepted_client_tenant_id) VALUES('pi1','t1','a@example.test','h1','2099-01-01','t2'),('pi2','t2','b@example.test','h2','2099-01-01','t1')");

db.exec('BEGIN');
try{
  for(const [sql,args] of [
    ["DELETE FROM audit_events WHERE tenant_id=?",['t1']],
    ["DELETE FROM ai_usage WHERE tenant_id=?",['t1']],
    ["DELETE FROM payment_return_events WHERE tenant_id=?",['t1']],
    ["DELETE FROM payment_integrity_anomalies WHERE tenant_id=?",['t1']],
    ["DELETE FROM partner_task_events WHERE partner_tenant_id=? OR client_tenant_id=?",['t1','t1']],
    ["DELETE FROM partner_tasks WHERE partner_tenant_id=? OR client_tenant_id=?",['t1','t1']],
    ["DELETE FROM partner_access_events WHERE partner_tenant_id=? OR client_tenant_id=?",['t1','t1']],
    ["DELETE FROM partner_clients WHERE partner_tenant_id=? OR client_tenant_id=?",['t1','t1']],
    ["DELETE FROM partner_invites WHERE partner_tenant_id=? OR accepted_client_tenant_id=?",['t1','t1']],
  ]) db.prepare(sql).run(...args);
  db.prepare(`DELETE FROM users WHERE id IN (
    SELECT m.user_id FROM memberships m WHERE m.tenant_id=? AND NOT EXISTS (
      SELECT 1 FROM memberships other WHERE other.user_id=m.user_id AND other.tenant_id<>m.tenant_id
    )
  )`).run('t1');
  db.prepare("INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged) VALUES(?,?,?,?,?,?)")
    .run('dr1','fingerprint-not-raw-t1','v1',1,2,1);
  db.prepare("DELETE FROM tenants WHERE id=?").run('t1');
  db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e}

ok(!get("SELECT 1 x FROM tenants WHERE id='t1'"),'target tenant deleted');
ok(!!get("SELECT 1 x FROM tenants WHERE id='t2'"),'other tenant preserved');
ok(!get("SELECT 1 x FROM evidence WHERE tenant_id='t1'"),'cascade-owned evidence metadata deleted');
ok(!!get("SELECT 1 x FROM evidence WHERE tenant_id='t2'"),'other tenant evidence preserved');
ok(!get("SELECT 1 x FROM deletion_requests WHERE id='dr1'"),'PII-bearing deletion request cascades away');
ok(!!get("SELECT 1 x FROM deletion_tombstones WHERE request_id='dr1'"),'minimal completion tombstone remains');
ok(!get("SELECT 1 x FROM users WHERE id='u1'"),'user belonging only to deleted tenant removed');
ok(!!get("SELECT 1 x FROM users WHERE id='u2'"),'shared user preserved');
ok(!!get("SELECT 1 x FROM memberships WHERE tenant_id='t2' AND user_id='u2'"),'shared user other-tenant membership preserved');
for(const table of ['audit_events','ai_usage','payment_return_events','payment_integrity_anomalies']){
  ok(!get(`SELECT 1 x FROM ${table} WHERE tenant_id='t1'`),`${table} target rows purged`);
  ok(!!get(`SELECT 1 x FROM ${table} WHERE tenant_id='t2'`),`${table} other rows preserved`);
}
for(const table of ['partner_clients','partner_tasks','partner_access_events','partner_task_events']){
  ok(!get(`SELECT 1 x FROM ${table} WHERE partner_tenant_id='t1' OR client_tenant_id='t1'`),`${table} target relationships purged`);
}
ok(!get("SELECT 1 x FROM partner_invites WHERE partner_tenant_id='t1' OR accepted_client_tenant_id='t1'"),'partner invites involving deleted tenant purged');
console.log(`V78 1.21.52 tenant deletion purge runtime: ${checks}/${checks} PASS`);
