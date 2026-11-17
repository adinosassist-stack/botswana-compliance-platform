import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagerAccessRequestsHttp} from '../cloudflare/src/manager-access-requests-http.js';
const origin='https://private-staging.example';
const principal={tenantId:'tenant-a',userId:'user-a',role:'reviewer'};
const actions=[];
class Statement {
 constructor(sql){this.sql=sql;this.args=[];}
 bind(...args){this.args=args;return this;}
 async first(){return {ok:1};}
 async all(){return {results:[{id:'req-one',status:'pending'}]};}
}
const db={prepare(sql){return new Statement(sql);},async batch(statements){actions.push(statements);return statements.map(()=>({success:true}));}};
const handler=(opts={})=>createManagerAccessRequestsHttp({db,origin,authenticate:async()=>principal,verifyCsrf:async()=>true,rateLimit:async()=>true,newId:()=>'req-one',...opts});
const req=(path,body,opts={})=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',...opts.headers},body:JSON.stringify(body)});
test('registered user request is tenant-derived, review only, no privilege grant',async()=>{
 const res=await handler()(req('/api/workspace/managers/access-requests',{locationId:'branch-a',reason:'Please review'}));
 assert.equal(res.status,201);assert.equal((await res.json()).status,'pending');
 const sql=actions.at(-1).map(s=>s.sql).join(';');
 assert.match(sql,/INSERT INTO workspace_manager_access_requests/);
 assert.match(sql,/role IN \('reviewer','auditor'\)/);
 assert.doesNotMatch(sql,/UPDATE memberships|INSERT INTO memberships|UPDATE sessions|location_grants/i);
 assert.equal(actions.at(-1)[1].args[1],'tenant-a');
 assert.equal(actions.at(-1)[1].args[2],'user-a');
});
test('reject spoofing, cross-origin, CSRF, unregistered and manager role',async()=>{
 const url='/api/workspace/managers/access-requests';
 assert.equal((await handler()(req(url,{tenantId:'other',locationId:'branch-a'}))).status,400);
 assert.equal((await handler()(req(url,{locationId:'branch-a'},{headers:{origin:'https://evil.example'}}))).status,403);
 assert.equal((await handler({verifyCsrf:async()=>false})(req(url,{locationId:'branch-a'}))).status,403);
 assert.equal((await handler({authenticate:async()=>null})(req(url,{locationId:'branch-a'}))).status,401);
 assert.equal((await handler({authenticate:async()=>({...principal,role:'manager'})})(req(url,{locationId:'branch-a'}))).status,403);
 assert.equal((await handler({rateLimit:async()=>false})(req(url,{locationId:'branch-a'}))).status,429);
});
test('owner review can record decision but cannot silently promote manager',async()=>{
 const a={...principal,role:'owner'};
 const h=handler({authenticate:async()=>a});
 assert.equal((await h(new Request(origin+'/api/workspace/managers/access-requests/inbox'))).status,200);
 const response=await h(req('/api/workspace/managers/access-requests/decide',{requestId:'req-one',decision:'approve'}));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,status:'approved_for_provisioning',managerActive:false});
 const sql=actions.at(-1).map(s=>s.sql).join(';');
 assert.doesNotMatch(sql,/UPDATE memberships|INSERT INTO memberships|UPDATE sessions|location_grants/i);
 assert.match(sql,/status='pending'/);
 assert.equal((await handler()(req('/api/workspace/managers/access-requests/decide',{requestId:'req-one',decision:'approve'}))).status,403);
});
test('only review decisions, strict payload size and method',async()=>{
 assert.equal((await handler({authenticate:async()=>({...principal,role:'owner'})})(req('/api/workspace/managers/access-requests/decide',{requestId:'req-one',decision:'grant_access'}))).status,400);
 assert.equal((await handler()(req('/api/workspace/managers/access-requests',{locationId:'branch-a'},{headers:{'content-length':'999999'}}))).status,413);
 assert.equal((await handler()(new Request(origin+'/api/workspace/managers/access-requests',{method:'DELETE'}))).status,404);
});
