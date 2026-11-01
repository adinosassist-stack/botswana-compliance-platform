import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCorporateAssetsExpress} from '../server/corporate-assets-express.mjs';
test('registration is disabled by default',()=>{
 let routes=0;const app={get(){routes++}};
 assert.equal(registerCorporateAssetsExpress({app}),false);
 assert.equal(routes,0);
});
test('enabled registration requires security dependencies',()=>{
 assert.throws(()=>registerCorporateAssetsExpress({app:{get(){}},enabled:true}),/assets_express_dependencies_required/);
});
test('opt-in registration mounts exactly three protected read endpoints',()=>{
 const routes=[];
 const middleware=()=>{};
 const app={get(...args){routes.push(args)}};
 assert.equal(registerCorporateAssetsExpress({app,enabled:true,sessionAuth:middleware,entitlement:middleware,rateLimit:async()=>true,getDatabase:async()=>({query:async()=>({rows:[]})})}),true);
 assert.deepEqual(routes.map(r=>r[0]),['/api/assets','/api/assets/maintenance','/api/assets/insurance']);
 assert.ok(routes.every(r=>r[1]===middleware&&r[2]===middleware));
});

const companyId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
function setup({role='owner',auth=true,limit=true}={}){
 const routes=[];const queries=[];
 const middleware=()=>{};
 registerCorporateAssetsExpress({
  app:{get(...args){routes.push(args)}},enabled:true,sessionAuth:middleware,entitlement:middleware,
  rateLimit:async()=>limit,
  getDatabase:async()=>({query:async(sql,params)=>{queries.push({sql,params});return {rows:[]}}})
 });
 const request={method:'GET',auth:auth?{tenant_id:companyId,user_id:userId,role}:undefined};
 const response={status(code){this.code=code;return this},set(headers){this.headers=headers;return this},json(body){this.body=body;return this}};
 return {routes,queries,request,response};
}
test('authenticated owner can list assets only within session tenant',async()=>{
 const s=setup();
 await s.routes[0][3](s.request,s.response);
 assert.equal(s.response.code,200);
 assert.deepEqual(s.response.body,{assets:[]});
 assert.deepEqual(s.queries[0].params,[companyId,50]);
});
test('missing authentication and insufficient roles never query database',async()=>{
 for(const options of [{auth:false},{role:'viewer'},{limit:false}]){
  const s=setup(options);
  await s.routes[0][3](s.request,s.response);
  assert.equal(s.queries.length,0);
  assert.equal(s.response.code,options.limit===false?429:options.auth===false?401:403);
 }
});
test('all routes return no-store JSON responses',async()=>{
 const s=setup();
 for(const route of s.routes){
  const res={...s.response};
  await route[3](s.request,res);
  assert.equal(res.code,200);
  assert.equal(res.headers['cache-control'],'no-store');
 }
});

test('permission map rejects prototype property role',async()=>{
 const s=setup({role:'constructor'});
 await s.routes[0][3](s.request,s.response);
 assert.equal(s.response.code,403);
 assert.equal(s.queries.length,0);
});
test('read-only adapter cannot be mounted without an entitlement middleware',()=>{
 assert.throws(()=>registerCorporateAssetsExpress({app:{get(){}},enabled:true,sessionAuth:()=>{},rateLimit:()=>true,getDatabase:()=>({})}),/assets_express_dependencies_required/);
});
