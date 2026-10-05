import assert from "node:assert/strict";
import {normalizeResponsibility,validateResponsibility,responsibilityCanRequestAction,RESPONSIBILITY_AUTONOMY_CEILING} from "../cloudflare/src/agent-responsibilities.js";

const valid=validateResponsibility({
  title:"Watch receivables",
  objective:"Identify overdue customer balances and prepare follow-up actions.",
  workspace:"finance",
  autonomyCeiling:RESPONSIBILITY_AUTONOMY_CEILING.PREPARE,
  scheduleKind:"interval",
  scheduleSpec:"daily",
  toolScope:["finance.read","receivables.read"],
  dataScope:["finance.receivables"]
});
assert.equal(valid.ok,true);
assert.equal(valid.value.workspace,"finance");
assert.deepEqual(valid.value.toolScope,["finance.read","receivables.read"]);

assert.equal(validateResponsibility({title:"x",objective:"y",workspace:"unknown"}).ok,false);
assert.equal(validateResponsibility({title:"x",objective:"y",workspace:"finance",scheduleKind:"event"}).ok,false);
assert.equal(validateResponsibility({title:"x",objective:"y",workspace:"finance",autonomyCeiling:3}).ok,false);
assert.equal(validateResponsibility({title:"x",objective:"y",workspace:"finance",budgetMinor:-1}).ok,false);

const activePrepare={status:"active",autonomyCeiling:1,toolScope:["finance.read"]};
assert.deepEqual(
  responsibilityCanRequestAction({responsibility:activePrepare,actionKey:"finance.read",toolKey:"finance.read",executionRequested:false}),
  {allowed:true,code:"responsibility_allows_proposal"}
);
assert.equal(responsibilityCanRequestAction({responsibility:activePrepare,actionKey:"task.create",toolKey:"task.create",executionRequested:true}).allowed,false);
assert.equal(responsibilityCanRequestAction({responsibility:{...activePrepare,status:"paused"},actionKey:"finance.read",toolKey:"finance.read"}).allowed,false);
assert.equal(responsibilityCanRequestAction({responsibility:activePrepare,actionKey:"finance.read",toolKey:"property.read"}).allowed,false);

const bounded={status:"active",autonomyCeiling:2,toolScope:["task.create"]};
const gate=responsibilityCanRequestAction({responsibility:bounded,actionKey:"task.create",toolKey:"task.create",executionRequested:true});
assert.deepEqual(gate,{allowed:true,code:"responsibility_allows_guard_evaluation"});
assert.notEqual(gate.code,"execution_allowed");

const normalized=normalizeResponsibility({title:"  A   B  ",objective:"  C  ",workspace:"FINANCE",toolScope:["x","x"," y "]});
assert.equal(normalized.title,"A B");
assert.deepEqual(normalized.toolScope,["x","y"]);

console.log("v285 agent responsibility governance: ok");
