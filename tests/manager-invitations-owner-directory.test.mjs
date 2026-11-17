import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createManagerOwnerDirectoryHttp} from '../cloudflare/src/manager-invitations-owner-directory.js';

const identity={role:'owner',tenantId:'tenant-a',userId:'owner-a'};
function dbFactory({allowed=true,fail=false}={}){
 const calls=[];
 const db={prepare(sql){return{bind(...params){calls.push({sql,params});return{
  async first(){if(fail)throw Error('db_unavailable');return {ok:allowed?1:0}},
  async all(){if(fail)throw Error('db_unavailable');return {results:[]}}
 }}}}};
 return {db,calls};
}
const req=(path='/api/workspace/managers/directory')=>new Request('https://staging.example.invalid'+path);
test('owner directory reads only authenticated tenant and never exposes secrets',async()=>{
 const {db,calls}=dbFactory();
 const r=await createManagerOwnerDirectoryHttp({db})(req('/api/workspace/managers/directory?tenantId=tenant-b'),identity);
 assert.equal(r.status,200);
 const body=await r.json();assert.deepEqual(body,{ok:true,invites:[],locations:[],grants:[]});
 assert.deepEqual(calls[0].params,['tenant-a','owner-a']);
 for(const call of calls.slice(1))assert.deepEqual(call.params,['tenant-a']);
 assert.equal(calls.length,4);
 const allSql=calls.map(x=>x.sql).join(' ');
 assert.doesNotMatch(allSql,/token_hash|password_hash|csrf_token|session_generation/);
 assert.match(allSql,/m\.status membership_status/);
 assert.match(allSql,/i\.tenant_id=\?/);
 assert.match(allSql,/g\.tenant_id=\?/);
});
test('non-owner or inactive owner cannot list manager invitations',async()=>{
 const {db,calls}=dbFactory({allowed:false});
 const h=createManagerOwnerDirectoryHttp({db});
 assert.equal((await h(req(),{...identity,role:'manager'})).status,403);
 assert.equal(calls.length,0);
 assert.equal((await h(req(),identity)).status,403);
 assert.equal(calls.length,1);
});
test('directory fails closed when schema not yet available',async()=>{
 const {db}=dbFactory({fail:true});
 assert.equal((await createManagerOwnerDirectoryHttp({db})(req(),identity)).status,503);
});
test('owner directory is routed behind private staging gate only',()=>{
 const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
 const i=worker.indexOf("url.pathname==='/api/workspace/managers/directory'");
 const b=worker.slice(i-90,i+270);
 assert.ok(i>0);
 assert.match(b,/managerInviteStage/);
 assert.match(b,/createManagerOwnerDirectoryHttp/);
});
