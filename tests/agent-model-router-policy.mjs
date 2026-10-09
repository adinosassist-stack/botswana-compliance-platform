import assert from "node:assert/strict";
import {selectAgentModel} from "../cloudflare/src/agent-model-router-policy.js";
const models=[
{id:"premium",enabled:true,taskClasses:["summary"],estimatedCostUsd:0.05,evalPassRate:0.99,regions:["eu"]},
{id:"economy",enabled:true,taskClasses:["summary"],estimatedCostUsd:0.01,evalPassRate:0.96,regions:["eu"]},
{id:"unsafe",enabled:true,taskClasses:["summary"],estimatedCostUsd:0.001,evalPassRate:0.8,regions:["eu"]}
];
assert.equal(selectAgentModel({taskClass:"summary",models,budgetUsd:0.1,requiredRegion:"eu"}).modelId,"economy");
assert.equal(selectAgentModel({taskClass:"summary",models,budgetUsd:0.005}).reason,"no_approved_model");
assert.equal(selectAgentModel({taskClass:"write",models,budgetUsd:1}).reason,"unsupported_task_class");
assert.equal(selectAgentModel({taskClass:"summary",models,budgetUsd:1,requiredRegion:"bw"}).reason,"no_approved_model");
assert.equal(selectAgentModel({taskClass:"summary",models,budgetUsd:-1}).reason,"invalid_budget");
assert.equal(selectAgentModel({taskClass:"summary",models,budgetUsd:1,requiredRegion:""}).reason,"invalid_region");
assert.equal(selectAgentModel({taskClass:"summary",models,budgetUsd:1,requiredRegion:42}).reason,"invalid_region");
console.log("agent model routing policy: PASS");
