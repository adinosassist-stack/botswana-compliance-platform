import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {registerPrivateAgentHistory} from "../server/agent-approval-history-private-host.js";

// Guard both the actual server wiring and the runtime default-deny boundary.
// This is a source-wiring regression, not a substitute for live session-cookie tests.
test("real server mounts private Agent history only in explicit test mode",()=>{
 const source=readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
 const call=source.match(/registerPrivateAgentHistory\(\{[\s\S]*?\}\);/);
 assert.ok(call,"server must retain explicit private Agent route registration");
 assert.match(call[0],/enabled:\s*config\.APP_ENV==="test"\s*&&\s*process\.env\.AGENT_HISTORY_PRIVATE_TEST_ENABLED==="true"/);
 assert.match(call[0],/killSwitch:\s*process\.env\.AGENT_HISTORY_PRIVATE_TEST_KILL_SWITCH!=="false"/);
 assert.match(call[0],/sessionAuth:\s*auth\s*,\s*pool/);
 assert.match(call[0],/requestOriginAllowed:\s*nodeRequestOriginAllowed/);
});
test("private Agent host registers no route when disabled or kill-switched",()=>{
 for(const settings of [{enabled:false,killSwitch:false},{enabled:true,killSwitch:true},{}]){
  let count=0;
  const registered=registerPrivateAgentHistory({app:{get(){count++}},...settings});
  assert.equal(registered,false);
  assert.equal(count,0);
 }
});
