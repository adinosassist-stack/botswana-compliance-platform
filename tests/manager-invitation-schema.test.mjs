import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const sql=fs.readFileSync(new URL('../db/drafts/manager-invitations-2578.sql',import.meta.url),'utf8');
test('candidate SQL only; new table and no unsafe live member mutation',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS workspace_manager_invites/i);
 assert.match(sql,/FOREIGN KEY\(tenant_id\) REFERENCES tenants/i);
 assert.match(sql,/token_hash TEXT NOT NULL UNIQUE/);
 assert.match(sql,/CHECK\(status IN \('pending','accepted','revoked'\)\)/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\s+(?:INTO\s+|FROM\s+|TABLE\s+)?(?:users|memberships|sessions)\b/i);
});
