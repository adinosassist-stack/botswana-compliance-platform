import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
const sql=readFileSync(new URL('../cloudflare/migrations/20261021_employee_ai_workflows.sql',import.meta.url),'utf8');
test('Cloudflare D1 schema creates tenant-owner composite identity',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(sql);
  db.prepare('INSERT INTO employee_ai_workflows (tenant_id,owner_id,workflow_id,definition) VALUES (?,?,?,?)').run('t1','u1','w1','{"id":"w1"}');
  db.prepare('INSERT INTO employee_ai_workflows (tenant_id,owner_id,workflow_id,definition) VALUES (?,?,?,?)').run('t2','u1','w1','{"id":"w1"}');
  assert.equal(db.prepare('SELECT count(*) AS n FROM employee_ai_workflows').get().n,2);
  assert.throws(()=>db.prepare('INSERT INTO employee_ai_workflows (tenant_id,owner_id,workflow_id,definition) VALUES (?,?,?,?)').run('t1','u1','w1','{}'));
  assert.throws(()=>db.prepare('INSERT INTO employee_ai_workflows (tenant_id,owner_id,workflow_id,definition) VALUES (?,?,?,?)').run('t1','u1','w2','not-json'));
 } finally {db.close()}
});

test('D1 migration is repeatable and enforces JSON size and scoped index',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(sql);
  db.exec(sql);
  const indexes=db.prepare("PRAGMA index_list('employee_ai_workflows')").all();
  assert.ok(indexes.some(row=>row.name==='idx_employee_ai_workflows_owner'));
  const insert=db.prepare('INSERT INTO employee_ai_workflows (tenant_id,owner_id,workflow_id,definition) VALUES (?,?,?,?)');
  insert.run('tenant-a','owner-a','workflow-a','{}');
  insert.run('tenant-a','owner-b','workflow-a','{}');
  assert.equal(db.prepare('SELECT count(*) AS n FROM employee_ai_workflows WHERE tenant_id=? AND owner_id=?').get('tenant-a','owner-a').n,1);
  assert.throws(()=>insert.run('tenant-a','owner-a','workflow-b','x'.repeat(16385)));
  assert.throws(()=>insert.run('tenant-a','owner-a','x'.repeat(65),'{}'));
 } finally {db.close()}
});
