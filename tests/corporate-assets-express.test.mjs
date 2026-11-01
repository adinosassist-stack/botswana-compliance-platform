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
