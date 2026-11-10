import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
test("real server mounts private Agent history only under test flag and kill switch",()=>{
 assert.match(source,/registerPrivateAgentHistory\(\{/);
 assert.match(source,/enabled:config\.APP_ENV==="test" && process\.env\.AGENT_HISTORY_PRIVATE_TEST_ENABLED==="true"/);
 assert.match(source,/killSwitch:process\.env\.AGENT_HISTORY_PRIVATE_TEST_KILL_SWITCH!=="false"/);
 assert.match(source,/sessionAuth:auth,pool/);
 assert.match(source,/requestOriginAllowed:nodeRequestOriginAllowed/);
});
test("private Agent registration follows real session middleware declaration",()=>{
 assert.ok(source.indexOf("async function auth(")<source.indexOf("registerPrivateAgentHistory({"));
});
