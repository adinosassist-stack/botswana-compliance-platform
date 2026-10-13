import assert from "node:assert/strict";
import fs from "node:fs";

const coreSource=fs.readFileSync("cloudflare/src/agentic-core.js","utf8");
const voiceSource=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");

assert.match(coreSource,/function advisorContextDisclosure\(data\)/,"agentic planning must normalize advisor context metadata before exposing it to voice");
assert.match(coreSource,/contextAvailability:contextDisclosure\.contextAvailability/);
assert.match(coreSource,/contextCompaction:contextDisclosure\.contextCompaction/);
assert.match(coreSource,/run:\{id:runId,goal,status:"completed",generationMode:advisor\.generationMode,confidence,summary,contextAvailability:advisor\.contextAvailability\|\|null,contextCompaction:advisor\.contextCompaction\|\|null,observation\}/);
assert.doesNotMatch(coreSource,/contextAvailability:.*execution/i,"context disclosure must not become execution authority");

assert.match(voiceSource,/function spokenContextNotice\(plan\)/);
assert.match(voiceSource,/Some live workspace context was unavailable/);
assert.match(voiceSource,/Workspace context completeness could not be verified/);
assert.match(voiceSource,/Some lower-priority workspace context was compacted/);
assert.match(voiceSource,/const contextNotice=spokenContextNotice\(plan\)/);
assert.match(voiceSource,/contextAvailability:plan\?\.run\?\.contextAvailability\|\|null/);
assert.match(voiceSource,/contextCompaction:plan\?\.run\?\.contextCompaction\|\|null/);
assert.match(voiceSource,/executionPerformed:false/);
assert.doesNotMatch(voiceSource,/voiceMayExecute:true|permissionsExpanded:true|runtimeGuardBypassed:true/);

const {__agenticLiveVoiceTest:test}=await import("../cloudflare/src/agentic-live-voice.js");

const base={
  run:{id:"run-1",status:"completed",summary:"The review is ready."},
  proposals:[]
};

const unavailable=structuredClone(base);
unavailable.run.contextAvailability={financeAndBusiness:"unavailable",financeAndBusinessComplete:false,financeAndBusinessReason:"business_context_unavailable"};
unavailable.run.contextCompaction={applied:false,stage:"full"};
const unavailableSpeech=test.spokenResult(unavailable);
assert.match(unavailableSpeech,/Some live workspace context was unavailable/);
assert.match(unavailableSpeech,/not a complete workspace review/);
assert.match(unavailableSpeech,/No business action was executed/);

const compacted=structuredClone(base);
compacted.run.contextAvailability={financeAndBusiness:"available",financeAndBusinessComplete:true,contextCompaction:"compacted",contextComplete:false};
compacted.run.contextCompaction={applied:true,stage:"bounded"};
const compactedSpeech=test.spokenResult(compacted);
assert.match(compactedSpeech,/Some lower-priority workspace context was compacted/);
assert.match(compactedSpeech,/bounded AI context/);
assert.match(compactedSpeech,/No business action was executed/);

const unknown=structuredClone(base);
unknown.run.contextAvailability={financeAndBusiness:"unknown",financeAndBusinessComplete:false,financeAndBusinessReason:"advisor_context_unverified"};
unknown.run.contextCompaction={applied:false,stage:null};
assert.match(test.spokenResult(unknown),/Workspace context completeness could not be verified/);

const complete=structuredClone(base);
complete.run.contextAvailability={financeAndBusiness:"available",financeAndBusinessComplete:true,contextComplete:true};
complete.run.contextCompaction={applied:false,stage:"full"};
const completeSpeech=test.spokenResult(complete);
assert.doesNotMatch(completeSpeech,/workspace context was unavailable|context completeness could not be verified|workspace context was compacted/i);
assert.match(completeSpeech,/No business action was executed/);

assert.equal(test.spokenContextNotice(unavailable).includes("unavailable"),true);
assert.equal(test.spokenContextNotice(compacted).includes("compacted"),true);

console.log("v330 live voice context disclosure: PASS");
