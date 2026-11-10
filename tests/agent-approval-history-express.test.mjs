import test from "node:test";
import assert from "node:assert/strict";
import {registerAgentApprovalHistoryExpress as register} from "../server/agent-approval-history-express.js";
const setup=()=>{
 const routes=[];
 const app={get(...args){routes.push(args)}};
 const deps={app,sessionAuth:(_req,_res,next)=>next(),tenantMembership:async()=>true,
 originCheck:async()=>true,rateLimit:async()=>true,auditAvailable:async()=>true,
 getDatabase:()=>({query:async()=>({rows:[]})})};
 return {routes,deps};
};
const invoke=async(route,auth)=>{
 let result;const req={method:"GET",auth};
 const res={status(n){result={status:n};return this},set(){return this},json(body){result.body=body;return this}};
 await route[2](req,res);return result;
};
test("registration defaults off and kill switch never mounts",()=>{
 const {routes,deps}=setup();
 assert.equal(register(deps),false);
 assert.equal(register({...deps,enabled:true,killSwitch:true}),false);
 assert.equal(routes.length,0);
});
test("missing security dependencies fail closed",()=>{
 const {deps}=setup();delete deps.originCheck;
 assert.throws(()=>register({...deps,enabled:true}),/security_dependencies/);
});
test("real middleware principal is mandatory and async guards deny",async()=>{
 const {routes,deps}=setup();register({...deps,enabled:true});
 assert.equal(routes.length,1);
 const auth={id:"session",tenant_id:"tenant-a",user_id:"owner-a",role:"owner"};
 assert.equal((await invoke(routes[0],null)).status,401);
 assert.equal((await invoke(routes[0],auth)).status,200);
 const {routes:deniedRoutes,deps:deniedDeps}=setup();
 register({...deniedDeps,enabled:true,tenantMembership:async()=>false});
 assert.equal((await invoke(deniedRoutes[0],auth)).status,403);
});
