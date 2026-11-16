import test from "node:test";
import assert from "node:assert/strict";
import {registerPrivateAgentHistory as register} from "../server/agent-approval-history-private-host.js";
test("private endpoint is disabled by default and by kill switch",()=>{
 let mounted=0;const app={get(){mounted++}};
 assert.equal(register({app}),false);
 assert.equal(register({app,enabled:true}),false);
 assert.equal(mounted,0);
});
test("explicit private enablement requires trusted host dependencies",()=>{
 assert.throws(()=>register({enabled:true,killSwitch:false}),/dependencies_required/);
});
test("explicitly enabled composition registers exactly one read-only route",()=>{
 const routes=[];
 const app={get(...args){routes.push(args)}};
 const pool={query:async()=>({rows:[]})};
 assert.equal(register({app,enabled:true,killSwitch:false,sessionAuth:(_req,_res,next)=>next(),
 pool,publicOrigin:"https://thebedesk.com",requestOriginAllowed:()=>true}),true);
 assert.equal(routes.length,1);
 assert.equal(routes[0][0],"/api/agent/approval-history");
});
