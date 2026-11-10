import test from "node:test";
import assert from "node:assert/strict";
import {createAgentHistorySecurityCallbacks as create} from "../server/agent-approval-history-security-callbacks.js";
const config={requestOriginAllowed:(origin,expected)=>origin===expected,
 publicOrigin:"https://thebedesk.com",auditHealth:async()=>true};
test("origin denies cross-site and untrusted origins",async()=>{
 const g=create(config);
 assert.equal(await g.allowedOrigin({headers:{"sec-fetch-site":"cross-site"}}),false);
 assert.equal(await g.allowedOrigin({headers:{origin:"https://evil.example"}}),false);
 assert.equal(await g.allowedOrigin({headers:{origin:"https://thebedesk.com","sec-fetch-site":"same-origin"}}),true);
});
test("per principal limit denies excessive reads",async()=>{
 let t=0;const g=create({...config,maxRequests:2,now:()=>t});
 const a={tenant_id:"t",user_id:"u"};
 assert.equal(await g.rateLimit({},a),true);
 assert.equal(await g.rateLimit({},a),true);
 assert.equal(await g.rateLimit({},a),false);
 t=61000;assert.equal(await g.rateLimit({},a),true);
 assert.equal(await g.rateLimit({},null),false);
});
test("audit health must explicitly return true",async()=>{
 const g=create({...config,auditHealth:async()=>"true"});
 assert.equal(await g.auditAvailable({},{}),false);
});
