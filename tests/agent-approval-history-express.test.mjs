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

test("denied requests never acquire a database connection",async()=>{
 let acquisitions=0;
 const {routes,deps}=setup();
 register({...deps,enabled:true,tenantMembership:async()=>false,
  getDatabase:()=>{acquisitions++;throw new Error("must not connect");}});
 const auth={id:"session",tenant_id:"tenant-a",user_id:"owner-a",role:"owner"};
 const response=await invoke(routes[0],auth);
 assert.equal(response.status,403);
 assert.equal(acquisitions,0);
});

test("all rejected security guards prevent database acquisition",async()=>{
 const auth={id:"session",tenant_id:"tenant-a",user_id:"owner-a",role:"owner"};
 for(const guard of ["tenantMembership","originCheck","rateLimit","auditAvailable"]){
  let acquisitions=0;
  const {routes,deps}=setup();
  register({...deps,enabled:true,[guard]:async()=>false,
   getDatabase:()=>{acquisitions++;throw new Error("database must remain untouched");}});
  const response=await invoke(routes[0],auth);
  assert.notEqual(response.status,200,guard);
  assert.equal(acquisitions,0,guard);
 }
});
test("rejected session metadata never acquires a database connection",async()=>{
 let acquisitions=0;
 const {routes,deps}=setup();
 register({...deps,enabled:true,getDatabase:()=>{acquisitions++;throw new Error("unexpected database");}});
 const response=await invoke(routes[0],{tenant_id:"tenant-a",user_id:"owner-a",role:"owner"});
 assert.equal(response.status,401);
 assert.equal(acquisitions,0);
});
