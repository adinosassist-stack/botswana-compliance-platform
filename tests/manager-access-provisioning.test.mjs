import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {provisionManagerAccessD1} from '../cloudflare/src/manager-access-provisioning.js';
import {createManagerAccessRequestsHttp} from '../cloudflare/src/manager-access-requests-http.js';
const origin='https://private-staging.example';
function fakeDb({request={requester_user_id:'member-a',location_id:'branch-a'}}={}){
 const batches=[];
 const db={
  prepare(sql){return{sql,args:[],bind(...args){this.args=args;return this;},async first(){return sql.includes('SELECT requester_user_id')?request:{ok:1}}}},
  async batch(statements){batches.push(statements);return statements.map(()=>({success:true}))}
 };
 return {db,batches};
}
test('only approved request is eligible for owner-initiated atomic manager provisioning',async()=>{
 const {db,batches}=fakeDb();
 const output=await provisionManagerAccessD1(db,{tenantId:'tenant-a',ownerId:'owner-a',requestId:'req-a'});
 assert.equal(output.managerActive,true);
 assert.equal(output.reauthenticationRequired,true);
 assert.equal(batches.length,1);
 const stmts=batches[0],sql=stmts.map(s=>s.sql).join(';');
 assert.match(sql,/role='owner'/);
 assert.match(sql,/role IN \('reviewer','auditor'\)/);
 assert.match(sql,/status='approved_for_provisioning'/);
 assert.match(sql,/operating_locations WHERE tenant_id=\?/);
 assert.match(sql,/UPDATE memberships SET role='manager'/);
 assert.match(sql,/INSERT INTO memberships/);
 assert.match(sql,/INSERT INTO workspace_manager_location_grants/);
 assert.match(sql,/status='provisioned'/);
 assert.match(sql,/DELETE FROM sessions/);
 assert.match(sql,/manager_access_request_provisioned/);
 assert.deepEqual(stmts[1].args,['tenant-a','member-a']);
 assert.deepEqual(stmts[3].args,['tenant-a','member-a','branch-a','owner-a']);
});
test('provisioning rejects missing approved request or owner self promotion',async()=>{
 await assert.rejects(()=>provisionManagerAccessD1(null,{}),/d1_binding_required/);
 await assert.rejects(()=>provisionManagerAccessD1(fakeDb({request:null}).db,{tenantId:'t',ownerId:'o',requestId:'r'}),/not_approved/);
 await assert.rejects(()=>provisionManagerAccessD1(fakeDb({request:{requester_user_id:'o',location_id:'l'}}).db,{tenantId:'t',ownerId:'o',requestId:'r'}),/not_approved/);
});
test('provision endpoint hidden until independently enabled, requires owner+CSRF',async()=>{
 const {db,batches}=fakeDb();
 const options={db,origin,authenticate:async()=>({tenantId:'tenant-a',userId:'owner-a',role:'owner'}),verifyCsrf:async()=>true,rateLimit:async()=>true};
 const make=()=>new Request(origin+'/api/workspace/managers/access-requests/provision',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({requestId:'req-a'})});
 assert.equal((await createManagerAccessRequestsHttp(options)(make())).status,404);
 const enabled=createManagerAccessRequestsHttp({...options,provisioningEnabled:true});
 const out=await enabled(make());
 assert.equal(out.status,200);assert.equal((await out.json()).status,'provisioned');
 assert.equal(batches.length,1);
 assert.equal((await createManagerAccessRequestsHttp({...options,provisioningEnabled:true,authenticate:async()=>({...await options.authenticate(),role:'reviewer'})})(make())).status,403);
 assert.equal((await createManagerAccessRequestsHttp({...options,provisioningEnabled:true,verifyCsrf:async()=>false})(make())).status,403);
});
test('deployment and migrated table remain disabled until independent release',()=>{
 const wrangler=fs.readFileSync(new URL('../cloudflare/wrangler.manager-invitations-functional-staging.toml',import.meta.url),'utf8');
 assert.match(wrangler,/^MANAGER_ACCESS_REQUESTS_ENABLED = "false"$/m);
 assert.match(wrangler,/^MANAGER_ACCESS_PROVISIONING_ENABLED = "false"$/m);
 const sql=fs.readFileSync(new URL('../db/drafts/manager-access-requests-self-service.sql',import.meta.url),'utf8');
 assert.match(sql,/approved_for_provisioning/);
 assert.match(sql,/provisioned/);
 assert.doesNotMatch(sql,/INSERT INTO memberships|UPDATE memberships/);
 const scoped=fs.readFileSync(new URL('../cloudflare/src/manager-invitations-scoped-read.js',import.meta.url),'utf8');
 assert.match(scoped,/allowProvisioned===true/);
 assert.match(scoped,/g\.status='active'/);
});
