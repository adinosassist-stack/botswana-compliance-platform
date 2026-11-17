import assert from 'node:assert/strict';
import test from 'node:test';
import {createManagerLocationAdminHttp} from '../cloudflare/src/manager-invitations-location-admin-http.js';
const origin='https://staging.thebedesk.com',a={role:'owner',membershipStatus:'active',tenantId:'tenant-a',userId:'owner-a'};
const history=[];
const db={prepare(sql){return{bind(...args){return{sql,args}}}},async batch(stmts){history.push(stmts);}};
const make=overrides=>createManagerLocationAdminHttp({db,origin,authenticateOwner:async()=>a,verifyCsrf:async()=>true,rateLimit:async()=>true,...overrides});
const req=(path,body,headers={})=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('owner grants and revokes only supplied manager/location IDs',async()=>{
 const b={locationId:'loc-a',managerId:'mgr-a'};
 assert.equal((await make()(req('/api/workspace/managers/locations/grant',b))).status,200);
 assert.equal((await make()(req('/api/workspace/managers/locations/revoke',b))).status,200);
 assert.equal(history.length,2);
 assert.deepEqual(history[0][0].args,['tenant-a','owner-a','tenant-a','mgr-a','tenant-a','loc-a']);
});
test('role, CSRF, origin, and tenant injection rejected before any mutation',async()=>{
 const n=history.length,p='/api/workspace/managers/locations/grant',b={locationId:'loc-a',managerId:'mgr-a'};
 assert.equal((await make({authenticateOwner:async()=>({...a,role:'manager'})})(req(p,b))).status,403);
 assert.equal((await make({verifyCsrf:async()=>false})(req(p,b))).status,403);
 assert.equal((await make()(req(p,b,{origin:'https://evil.invalid'}))).status,403);
 assert.equal((await make()(req(p,{...b,tenantId:'tenant-b'}))).status,400);
 assert.equal(history.length,n);
});
