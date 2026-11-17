import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {issueManagerInviteD1,activateManagerInviteD1} from '../cloudflare/src/manager-invitations-d1.js';
test('D1 candidate fails closed without a real Worker batch binding',async()=>{
 await assert.rejects(()=>issueManagerInviteD1({}, {tenantId:'a'}),/d1_binding_required/);
 await assert.rejects(()=>activateManagerInviteD1({}, {tokenHash:'a'}),/d1_binding_required/);
});
test('D1 candidate contains only batch mutations and explicit rollback-failing guard',()=>{
 const code=fs.readFileSync(new URL('../cloudflare/src/manager-invitations-d1.js',import.meta.url),'utf8');
 assert.match(code,/await db\.batch\(/);
 assert.match(code,/abs\(-9223372036854775808\)/);
 assert.match(code,/AND i\.status='pending'/);
 assert.match(code,/julianday\(i\.expires_at\)>julianday\(\?\)/);
 assert.doesNotMatch(code,/\bdb\.exec\(|\bBEGIN\b|\.run\(\)/);
});
