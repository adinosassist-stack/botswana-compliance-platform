import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const bootstrap=fs.readFileSync(new URL('../db/drafts/manager-invitations-2578-synthetic-bootstrap.sql',import.meta.url),'utf8');
const grants=fs.readFileSync(new URL('../db/drafts/manager-invitations-2578-location-grants.sql',import.meta.url),'utf8');
test('synthetic-only additive bootstrap has no account or activation mutations',()=>{
 assert.match(bootstrap,/ISOLATED SYNTHETIC STAGING ONLY/);
 assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS sessions/);
 assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS operating_locations/);
 assert.doesNotMatch(bootstrap,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\s+(?:INTO|FROM|TABLE)\b/i);
});
test('synthetic bootstrap and location grants create required tables without users',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
  CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE);
  CREATE TABLE memberships(tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',PRIMARY KEY(tenant_id,user_id));
  CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,actor_user_id TEXT,event_type TEXT NOT NULL,entity_type TEXT,entity_id TEXT,event_data TEXT NOT NULL DEFAULT '{}');`);
  db.exec(bootstrap);
  db.exec(grants);
  for(const name of ['sessions','operating_locations','workspace_manager_location_grants']){
   assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
  }
  assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);
 }finally{db.close();}
});
