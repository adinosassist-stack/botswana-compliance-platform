import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {__agenticLiveVoiceTest as liveTest} from "../cloudflare/src/agentic-live-voice.js";

const backend=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
const client=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const taskExecution=fs.readFileSync("cloudflare/src/agentic-task-execution.js","utf8");

for(const path of [
  "cloudflare/src/agentic-live-voice.js",
  "public/js/thebe-live-voice.js",
  "cloudflare/src/agentic-entry.js"
]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.equal(liveTest.normalizeVoiceIntent("prepare_internal_task"),"prepare_internal_task");
assert.equal(liveTest.normalizeVoiceIntent("PREPARE_INTERNAL_TASK"),"prepare_internal_task");
assert.equal(liveTest.normalizeVoiceIntent("execute_task"),"analyze");
assert.equal(liveTest.normalizeTaskPriority("high"),1);
assert.equal(liveTest.normalizeTaskPriority("medium"),2);
assert.equal(liveTest.normalizeTaskPriority("low"),3);
assert.equal(liveTest.normalizeTaskPriority("urgent"),2);

const task=liveTest.normalizeVoiceTask({
  title:"Review failed reconciliation",
  description:"Check the two unmatched finance items.",
  priority:"high",
  dueAt:"2026-09-21"
});
assert.equal(task.error,undefined);
assert.equal(task.task.title,"Review failed reconciliation");
assert.equal(task.task.priority,1);
assert.match(task.task.dueAt,/^2026-09-21T00:00:00\.000Z$/);
assert.equal(liveTest.normalizeVoiceTask({title:""}).error,"voice_task_title_required");
assert.equal(liveTest.normalizeVoiceTask({title:"Test",dueAt:"not-a-date"}).error,"voice_task_due_at_invalid");
assert.equal(liveTest.validPreparedTaskBackendPayload({ok:true,request:{id:"req-1",status:"prepared"}}),true);
assert.equal(liveTest.validPreparedTaskBackendPayload({ok:true,request:{id:null,status:"prepared"}}),false);
assert.equal(liveTest.validPreparedTaskBackendPayload({ok:true,request:{id:"req-1",status:"approved"}}),false);
assert.equal(liveTest.validPreparedTaskBackendPayload({ok:true}),false);
assert.match(backend,/task_backend_invalid_response/);
assert.match(backend,/governed_task_prepare_invalid_response/);

const tool=liveTest.delegationTool();
assert.equal(tool.name,"delegate_to_thebe_backend");
assert.deepEqual(tool.parameters.required,["request"]);
assert.deepEqual(tool.parameters.properties.intent.enum,["analyze","prepare_internal_task"]);
assert.deepEqual(tool.parameters.properties.task.required,["title"]);
assert.deepEqual(tool.parameters.properties.task.properties.priority.enum,["high","medium","low"]);

assert.match(liveTest.instructions(),/explicitly asks to create, add or record an internal task/i);
assert.match(liveTest.instructions(),/not approval and is not execution/i);
assert.match(liveTest.instructions(),/Never approve or execute an internal task from voice/i);

assert.match(backend,/activeVoiceTaskAuthority/);
assert.match(backend,/d\.action_key='task\.create'/);
assert.match(backend,/d\.max_autonomy_level>=3/);
assert.match(backend,/d\.external_side_effects=0/);
assert.match(backend,/d\.human_confirmation_required=1/);
assert.match(backend,/LIMIT 2/);
assert.match(backend,/ambiguous_task_execution_grant/);
assert.match(backend,/\/api\/agentic\/task-execution\/prepare/);
assert.match(backend,/idempotency-key/);
assert.match(backend,/THEBE_LIVE_TASK_PREPARED/);
assert.match(backend,/voiceMayApprove:false/);
assert.match(backend,/voiceMayExecute:false/);
assert.match(backend,/executionPerformed:false/);
assert.doesNotMatch(backend,/\/api\/agentic\/task-execution\/requests\/[^"'`]*\/approve/);
assert.doesNotMatch(backend,/\/api\/agentic\/task-execution\/requests\/[^"'`]*\/execute/);

const preparedContent=liveTest.preparedTaskContent({title:"Review supplier quote"});
assert.match(preparedContent,/prepared the internal task/i);
assert.match(preparedContent,/not approved or executed/i);
assert.match(preparedContent,/owner must approve/i);

assert.match(client,/intent==="prepare_internal_task"/);
assert.match(client,/taskPrepared=result\?\.authority\?\.taskPrepared===true/);
assert.match(client,/draft still exists pending owner approval/i);
assert.match(client,/Do not claim cancellation/i);
assert.match(client,/executionPerformed:false/);
assert.match(client,/body:JSON\.stringify\(\{delegationId:callId,sessionId,taskText,intent,task\}\)/);

assert.match(entry,/taskFetch:/);
assert.match(entry,/handleAgenticTaskExecutionRequest/);
assert.match(entry,/logicalPath:logicalRequestPath\(innerRequest\)/);

assert.match(taskExecution,/\/api\/agentic\/task-execution\/prepare/);
assert.match(taskExecution,/owner_approval_required/);
assert.match(taskExecution,/evaluateAgentRuntimeGuard/);
assert.match(taskExecution,/task_execution_verification_failed/);

console.log("v102 governed live-voice task preparation: PASS");
