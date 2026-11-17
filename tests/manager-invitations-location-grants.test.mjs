import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {grantManagerLocationD1,revokeManagerLocationD1,isManagerLocationAuthorized} from '../cloudflare/src/manager-invitations-location-grants.js';
test('a manager location requires a real D1 binding and complete tenant-scoped IDs',async()=>{
 await assert.rejects(()=>grantManagerLocationD1(null,{}),/d1_binding_required/);
 await assert.rejects(()=>revokeManagerLocationD1(null,{}),/d1_binding_required/);
 await assert.rejects(()=>isManagerLocationAuthorized(null,{}),/d1_binding_required/);
 const db={prepare(){throw Error('query must not run')},batch(){}};
 await assert.rejects(()=>grantManagerLocationD1(db,{tenantId:'t',ownerId:'owner',managerId:'owner',locationId:'l'}),/self_grant_forbidden/);
});
test('every location mutation demands active owner, manager and location, and uses atomic batch',()=>{
 const src=fs.readFileSync(new URL('../cloudflare/src/manager-invitations-location-grants.js',import.meta.url),'utf8');
 assert.equal((src.match(/await db\.batch\(/g)||[]).length,2);
 assert.match(src,/role='owner' AND status='active'/);
 assert.match(src,/role='manager' AND status='active'/);
 assert.match(src,/operating_locations WHERE tenant_id=\? AND id=\? AND active=1/);
 assert.match(src,/DELETE FROM sessions WHERE tenant_id=\? AND user_id=\?/);
});
test('location authorization requires matching tenant, active membership, grant and location',async()=>{
 let query='',args=[];
 const db={prepare(sql){query=sql;return{bind(...params){args=params;return{first:async()=>({allowed:1})}}}}};
 assert.equal(await isManagerLocationAuthorized(db,{tenantId:'t',managerId:'m',locationId:'l'}),true);
 assert.deepEqual(args,['t','m','l']);assert.match(query,/g\.tenant_id=\?/);
 assert.match(query,/m\.status='active'/);assert.match(query,/l\.active=1/);assert.match(query,/g\.status='active'/);
});
