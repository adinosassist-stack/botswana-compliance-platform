import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ddl=read('db/drafts/manager-invitations-2578-synthetic-login-rate-limit.sql');
test('isolated rate limit DDL matches canonical login and is additive only',()=>{
 const canonical=read('cloudflare/schema.sql');
 const worker=read('cloudflare/src/worker.js');
 assert.match(canonical,/CREATE TABLE IF NOT EXISTS auth_rate_limits\(/);
 assert.match(worker,/INSERT INTO auth_rate_limits\(/);
 assert.match(worker,/ON CONFLICT\(key_hash\) DO UPDATE SET count=auth_rate_limits.count\+1/);
 assert.match(ddl,/CREATE TABLE IF NOT EXISTS auth_rate_limits/);
 assert.doesNotMatch(ddl,/\b(?:INSERT INTO|UPDATE\s|DELETE FROM|DROP TABLE|ALTER TABLE)\b/i);
});
test('real SQLite rate limiter increments counters and preserves tenant isolation',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(ddl);
  const record=db.prepare("INSERT INTO auth_rate_limits(key_hash,scope,count,window_start,expires_at) VALUES(?,?,1,?,datetime('now',?)) ON CONFLICT(key_hash) DO UPDATE SET count=auth_rate_limits.count+1");
  record.run('synthetic-hash-a','login-ip',42,'+180 seconds');
  record.run('synthetic-hash-a','login-ip',42,'+180 seconds');
  record.run('synthetic-hash-b','login-account',42,'+180 seconds');
  assert.equal(db.prepare('SELECT count FROM auth_rate_limits WHERE key_hash=?').get('synthetic-hash-a').count,2);
  assert.equal(db.prepare('SELECT count FROM auth_rate_limits WHERE key_hash=?').get('synthetic-hash-b').count,1);
  assert.equal(db.prepare('SELECT count(*) n FROM auth_rate_limits').get().n,2);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close();}
});
