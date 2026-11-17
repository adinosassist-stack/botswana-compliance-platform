import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {revokeManagerInviteD1,suspendManagerMembershipD1} from '../cloudflare/src/manager-invitations-revocation.js';
test('no mutable D1 binding means no revocation',async()=>{
 await assert.rejects(()=>revokeManagerInviteD1(null,{}),/d1_binding_required/);
 await assert.rejects(()=>suspendManagerMembershipD1(null,{}),/d1_binding_required/);
});
test('refuse incomplete identity and owner self-suspension',async()=>{
 const db={prepare(){throw Error('should not query')},batch(){throw Error('should not write')}};
 await assert.rejects(()=>revokeManagerInviteD1(db,{tenantId:'t',actorId:'u'}),/invalid_request/);
 await assert.rejects(()=>suspendManagerMembershipD1(db,{tenantId:'t',actorId:'u',managerUserId:'u'}),/invalid_request/);
});
test('revocation uses atomic batch and authenticated tenant predicates',()=>{
 const code=fs.readFileSync(new URL('../cloudflare/src/manager-invitations-revocation.js',import.meta.url),'utf8');
 assert.equal((code.match(/await db\.batch\(/g)||[]).length,2);
 assert.match(code,/role='owner' AND status='active'/);
 assert.match(code,/DELETE FROM sessions WHERE tenant_id=\? AND user_id=\?/);
 assert.match(code,/manager_membership_suspended/);
 assert.match(code,/status='revoked'/);
 assert.doesNotMatch(code,/\.exec\(|\bBEGIN TRANSACTION\b/);
});
