import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../cloudflare/schema/general-ai-staging-auth.sql',import.meta.url),'utf8');
test('isolated auth has tenant-bound sessions and member status',()=>{
 for(const name of ['users','memberships','sessions'])assert.match(sql,new RegExp('CREATE TABLE '+name+'\\b'));
 assert.match(sql,/FOREIGN KEY\(user_id,tenant_id\) REFERENCES memberships\(user_id,tenant_id\)/);
 assert.match(sql,/status TEXT NOT NULL CHECK\(status IN \('active','inactive'\)\)/);
 assert.match(sql,/session_generation INTEGER NOT NULL/);
 assert.doesNotMatch(sql,/DROP TABLE|ALTER TABLE|INSERT INTO/i);
});
