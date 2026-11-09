import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const migration=readFileSync(new URL('../cloudflare/migrations/life-staging/0001_initial.sql',import.meta.url),'utf8');
const proposal=readFileSync(new URL('../docs/sql/thebe-life-d1-proposal.sql',import.meta.url),'utf8');
const tables=['life_households','life_household_members','life_household_entries','life_motshelo_groups','life_motshelo_members','life_motshelo_contributions'];
test('staging D1 candidate is schema-compatible with approved foundation proposal',()=>{
 const db=new DatabaseSync(':memory:'); const candidate=new DatabaseSync(':memory:');
 try {
  db.exec('PRAGMA foreign_keys = ON'); candidate.exec('PRAGMA foreign_keys = ON');
  db.exec(proposal); candidate.exec(migration);
  const schemas=connection=>connection.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  assert.deepEqual(schemas(candidate),schemas(db));
  assert.deepEqual(tables.filter(name=>!schemas(candidate).some(row=>row.name===name)),[]);
  assert.equal(candidate.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(candidate.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 } finally { db.close();candidate.close(); }
});
test('candidate migration only declares isolated Life tables and indexes',()=>{
 assert.doesNotMatch(migration,/\b(?:DROP|DELETE|UPDATE|ALTER|ATTACH|DETACH|REPLACE)\b/i);
 assert.doesNotMatch(migration,/\b(?:sessions|users|companies|invoices|bank_accounts)\b/i);
 for(const name of tables)assert.match(migration,new RegExp('CREATE TABLE IF NOT EXISTS '+name));
});
