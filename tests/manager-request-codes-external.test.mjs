import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto as crypto} from 'node:crypto';
import {createManagerRequestCodeD1,resolveManagerRequestCodeD1} from '../cloudflare/src/manager-request-codes.js';
import {createManagerAccessRequestsHttp} from '../cloudflare/src/manager-access-requests-http.js';
const origin='https://manager-staging.thebedesk.com';
function fakeDb(){
 const batches=[],queries=[];
 const db={prepare(sql){const statement={sql,args:[],bind(...args){this.args=args;return this;},async first(){
   if(sql.includes('SELECT c.tenant_id,c.location_id'))return {tenant_id:'business-b',location_id:'branch-b'};
   return {ok:1};
 },async all(){return {results:[]}}};queries.push(statement);return statement;},
 async batch(stmts){batches.push(stmts);return stmts.map(()=>({success:true}))}};
 return {db,batches,queries};
}
function post(path,body){return new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})}
const options=(db,role='owner')=>({db,origin,authenticate:async()=>({tenantId:'personal-a',userId:'registered-a',role}),verifyCsrf:async()=>true,rateLimit:async()=>true,newId:()=> 'req-a'});
test('business owner issues unpredictable hashed 48-hour code, never persists raw code',async()=>{
 const {db,batches}=fakeDb();
 const x=await createManagerRequestCodeD1(db,{tenantId:'business-b',ownerId:'owner-b',locationId:'branch-b',cryptoApi:crypto,now:1750000000000});
 assert.match(x.code,/^[a-f0-9]{64}$/);
 assert.equal(x.expiresAt,new Date(1750000000000+172800000).toISOString());
 const sql=batches[0].map(q=>q.sql).join(';');
 assert.match(sql,/role='owner' AND status='active'/);
 assert.match(sql,/code_hash/);
 assert.equal(batches[0][1].args[3].length,64);
 assert.notEqual(batches[0][1].args[3],x.code);
});
test('registered account owner can request manager access for other tenant using private business code',async()=>{
 const {db,batches}=fakeDb();
 const code='a'.repeat(64);
 const h=createManagerAccessRequestsHttp(options(db,'owner'));
 const res=await h(post('/api/workspace/managers/access-requests',{businessCode:code,reason:'Manage store'}));
 assert.equal(res.status,201);assert.equal((await res.json()).status,'pending');
 const last=batches.at(-1);
 assert.equal(last[1].args[1],'business-b');
 assert.equal(last[1].args[2],'registered-a');
 assert.equal(last[1].args[3],'branch-b');
 assert.match(last[0].sql,/NOT EXISTS\(SELECT 1 FROM memberships/);
 assert.doesNotMatch(last.map(x=>x.sql).join(';'),/INSERT INTO memberships|UPDATE memberships/);
});
test('request codes resolve a tenant+location from D1, not user supplied tenant',async()=>{
 const {db,queries}=fakeDb();
 const value=await resolveManagerRequestCodeD1(db,{code:'b'.repeat(64),requesterUserId:'registered-a',cryptoApi:crypto});
 assert.deepEqual(Object.keys(value).sort(),['codeHash','locationId','tenantId']);
 assert.equal(value.tenantId,'business-b');
 assert.match(queries.at(-1).sql,/julianday\(c.expires_at\)>julianday\('now'\)/);
 assert.match(queries.at(-1).sql,/c.revoked_at IS NULL/);
 assert.match(queries.at(-1).sql,/m.role='owner' AND m.status='active'/);
 assert.match(queries.at(-1).sql,/NOT EXISTS/);
});
test('no code: newly registered owner cannot request own-tenant self-elevation',async()=>{
 const {db}=fakeDb();
 const res=await createManagerAccessRequestsHttp(options(db,'owner'))(post('/api/workspace/managers/access-requests',{locationId:'branch-b'}));
 assert.equal(res.status,403);
});
test('malformed or missing code does not disclose tenant membership',async()=>{
 const {db}=fakeDb();
 const h=createManagerAccessRequestsHttp(options(db,'owner'));
 const result=await h(post('/api/workspace/managers/access-requests',{businessCode:'guess'}));
 assert.equal(result.status,409);
 assert.equal((await result.json()).error,'request_unavailable');
});
