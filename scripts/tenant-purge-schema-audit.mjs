import fs from 'node:fs';
const schema=fs.readFileSync('cloudflare/schema.sql','utf8');
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const explicit={
  audit_events:['tenant_id'],
  ai_usage:['tenant_id'],
  payment_return_events:['tenant_id'],
  payment_integrity_anomalies:['tenant_id'],
  partner_task_events:['partner_tenant_id','client_tenant_id'],
  partner_tasks:['partner_tenant_id','client_tenant_id'],
  partner_access_events:['partner_tenant_id','client_tenant_id'],
  partner_clients:['partner_tenant_id','client_tenant_id'],
  partner_invites:['partner_tenant_id','accepted_client_tenant_id'],
};
const expectedSql={
  audit_events:'DELETE FROM audit_events WHERE tenant_id=?',
  ai_usage:'DELETE FROM ai_usage WHERE tenant_id=?',
  payment_return_events:'DELETE FROM payment_return_events WHERE tenant_id=?',
  payment_integrity_anomalies:'DELETE FROM payment_integrity_anomalies WHERE tenant_id=?',
  partner_task_events:'DELETE FROM partner_task_events WHERE partner_tenant_id=? OR client_tenant_id=?',
  partner_tasks:'DELETE FROM partner_tasks WHERE partner_tenant_id=? OR client_tenant_id=?',
  partner_access_events:'DELETE FROM partner_access_events WHERE partner_tenant_id=? OR client_tenant_id=?',
  partner_clients:'DELETE FROM partner_clients WHERE partner_tenant_id=? OR client_tenant_id=?',
  partner_invites:'DELETE FROM partner_invites WHERE partner_tenant_id=? OR accepted_client_tenant_id=?',
};
let checks=0;
function ok(v,msg){checks++;if(!v)throw new Error(`FAIL: ${msg}`)}
const tableRe=/CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\((.*?)\);/gis;
const uncovered=[];
for(const m of schema.matchAll(tableRe)){
  const [,table,body]=m;
  const tenantCols=[...new Set([...body.matchAll(/\b([A-Za-z0-9_]*tenant_id)\b/gi)].map(x=>x[1]))];
  for(const col of tenantCols){
    const cascade=new RegExp(`FOREIGN KEY\\s*\\(${col}\\)\\s*REFERENCES\\s+tenants\\s*\\(id\\)\\s*ON DELETE CASCADE`,'i').test(body);
    if(!cascade && !(explicit[table]||[]).includes(col))uncovered.push(`${table}.${col}`);
  }
}
ok(uncovered.length===0,`every tenant-reference column must cascade or be explicitly purged; uncovered=${uncovered.join(',')}`);
for(const [table,sql] of Object.entries(expectedSql))ok(worker.includes(`"${sql}"`),`${table} must be explicitly purged before tenant deletion`);
ok(worker.includes('DELETE FROM tenants WHERE id=?'), 'tenant row must be deleted so cascade-owned records are purged');
ok(worker.includes('INSERT INTO deletion_tombstones'), 'deletion completion must leave a minimal tombstone');
ok(/CREATE TABLE IF NOT EXISTS deletion_tombstones\([\s\S]*tenant_fingerprint TEXT NOT NULL UNIQUE/.test(schema),'schema must include deletion tombstone fingerprint');
ok(!/CREATE TABLE IF NOT EXISTS deletion_tombstones\([\s\S]*\b(email|display_name|tenant_id|user_id|reason)\b/i.test(schema.match(/CREATE TABLE IF NOT EXISTS deletion_tombstones\([\s\S]*?\);/i)?.[0]||''),'deletion tombstone must not retain direct tenant/user PII fields');
ok(worker.includes('clean_object_key')&&worker.includes('const uniqueKeys=[...new Set(keys)]'),'tenant deletion must remove all distinct evidence object variants');
ok(worker.includes('TENANT_DELETION_EVIDENCE_BATCH=200'),'evidence deletion must be bounded per run');
ok(worker.includes('TENANT_DELETION_MAX_ATTEMPTS=100'),'large tenant deletions must be resumable beyond five batches');
console.log(`Tenant purge schema audit: ${checks}/${checks} PASS`);
