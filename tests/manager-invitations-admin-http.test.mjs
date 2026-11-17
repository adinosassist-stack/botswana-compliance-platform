import assert from 'node:assert/strict';
import test from 'node:test';
import {createManagerAccessAdminHttp} from '../cloudflare/src/manager-invitations-admin-http.js';
const origin='https://staging.thebedesk.com';
const principal={role:'owner',membershipStatus:'active',tenantId:'synthetic-tenant',userId:'synthetic-owner'};
let calls=0;
const db={prepare(sql){return{bind(...args){return{sql,args}}}},async batch(statements){calls++;assert.ok(statements.length>=3);}};
const make=(overrides={})=>createManagerAccessAdminHttp({db,origin,authenticateOwner:async()=>principal,verifyCsrf:async()=>true,rateLimit:async()=>true,...overrides});
const req=(path,body,headers={})=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('owner can revoke pending invitation through atomic batch',async()=>{
 const r=await make()(req('/api/workspace/managers/invitations/revoke',{inviteId:'synthetic-invite-a'}));assert.equal(r.status,200);assert.equal(calls,1);
});
test('owner can suspend manager through atomic batch',async()=>{
 const r=await make()(req('/api/workspace/managers/suspend',{managerUserId:'synthetic-manager'}));assert.equal(r.status,200);assert.equal(calls,2);
});
test('role, tenant injection, CSRF and origin failures are denied',async()=>{
 const endpoint='/api/workspace/managers/invitations/revoke';const start=calls;
 assert.equal((await make({authenticateOwner:async()=>({...principal,role:'manager'})})(req(endpoint,{inviteId:'x'}))).status,403);
 assert.equal((await make({verifyCsrf:async()=>false})(req(endpoint,{inviteId:'x'}))).status,403);
 assert.equal((await make()(req(endpoint,{inviteId:'x'},{origin:'https://evil.invalid'}))).status,403);
 assert.equal((await make()(req(endpoint,{inviteId:'x',tenantId:'other'}))).status,400);
 assert.equal(calls,start);
});
test('service rejects unknown routes',async()=>{assert.equal((await make()(req('/api/workspace/managers/unknown',{inviteId:'x'}))).status,404);});
