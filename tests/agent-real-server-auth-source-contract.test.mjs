import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Source-contract guard for the ACTUAL server.js auth wiring. This is not a
// runtime server integration test; the server's full boot requires its normal
// environment and schema. No production route is activated by this test.
const source=readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
function bodyBetween(start,end){
 const a=source.indexOf(start);
 assert.notEqual(a,-1,"missing server contract: "+start);
 const b=source.indexOf(end,a+start.length);
 assert.notEqual(b,-1,"missing server boundary: "+end);
 return source.slice(a,b);
}
test("real server Agent registration remains gated and uses canonical session auth",()=>{
 const registration=bodyBetween("registerPrivateAgentHistory({","app.get(\"/api/live\"");
 assert.match(registration,/enabled:\s*config\.APP_ENV\s*===\s*"test"\s*&&\s*process\.env\.AGENT_HISTORY_PRIVATE_TEST_ENABLED\s*===\s*"true"/);
 assert.match(registration,/killSwitch:\s*process\.env\.AGENT_HISTORY_PRIVATE_TEST_KILL_SWITCH\s*!==\s*"false"/);
 assert.match(registration,/sessionAuth:\s*auth\s*,\s*pool/);
 assert.match(registration,/requestOriginAllowed:\s*nodeRequestOriginAllowed/);
});
test("real server session query rejects revoked, expired, stale-generation and inactive memberships",()=>{
 const loader=bodyBetween("async function loadSessionAuth(req){","function timingSafeTextEqual(");
 assert.match(loader,/parseCookies\(req\.headers\.cookie\)\[SESSION_COOKIE\]/);
 assert.match(loader,/\[sessionHash\(token\)\]/);
 for(const check of [/s\.revoked_at\s+is\s+null/i,/s\.expires_at\s*>\s*now\(\)/i,/s\.session_generation\s*=\s*u\.session_generation/i,/m\.status\s*=\s*'active'/i,/m\.tenant_id\s*=\s*s\.tenant_id/i])assert.match(loader,check);
 assert.match(loader,/return\s+null/);
});
test("real server auth rejects absent session and checks mutation origin and CSRF",()=>{
 const auth=bodyBetween("async function auth(req,res,next){","function roles(");
 assert.match(auth,/req\.auth\s*=\s*await\s+loadSessionAuth\(req\)/);
 assert.match(auth,/if\(!req\.auth\)return res\.status\(401\)/);
 assert.match(auth,/nodeFetchMetadataAllowsBrowserMutation/);
 assert.match(auth,/nodeRequestOriginAllowed/);
 assert.match(auth,/timingSafeTextEqual\(req\.headers\["x-csrf-token"\],req\.auth\.csrf_token\)/);
});
