import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {registerPrivateAgentHistory} from "../server/agent-approval-history-private-host.js";
// Real isolated PostgreSQL qualification of private host's fail-closed guards.
// No sessions/memberships are provisioned in this disposable governance DB.
test("private host denies unverified session without reading approval history",{
 skip:!process.env.AGENT_HISTORY_TEST_DATABASE_URL
},async()=>{
 const pool=new pg.Pool({connectionString:process.env.AGENT_HISTORY_TEST_DATABASE_URL});
 const routes=[];
 try{
  const enabled=registerPrivateAgentHistory({
   app:{get(...args){routes.push(args)}},enabled:true,killSwitch:false,
   sessionAuth:(_req,_res,next)=>next(),pool,
   publicOrigin:"https://thebedesk.com",
   requestOriginAllowed:(origin,expected)=>origin===expected
  });
  assert.equal(enabled,true);
  assert.equal(routes.length,1);
  const handler=routes[0][2];
  const invoke=async(auth,headers={})=>{
   let result={};
   const res={status(status){result.status=status;return this},
    set(){return this},json(body){result.body=body;return this}};
   await handler({method:"GET",auth,headers},res);
   return result;
  };
  const missing=await invoke(null);
  assert.equal(missing.status,401);
  assert.deepEqual(missing.body.items,[]);
  const invalid=await invoke({id:"nonexistent",tenant_id:"tenant",user_id:"actor",role:"owner"});
  assert.notEqual(invalid.status,200);
  assert.deepEqual(invalid.body.items,[]);
  const crossSite=await invoke({id:"nonexistent",tenant_id:"tenant",user_id:"actor",role:"owner"},
   {"sec-fetch-site":"cross-site",origin:"https://evil.example"});
  assert.notEqual(crossSite.status,200);
  assert.deepEqual(crossSite.body.items,[]);
 }finally{await pool.end()}
});
