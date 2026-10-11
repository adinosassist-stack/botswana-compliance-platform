import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AI_ADVISOR_CONTEXT_MAX_BYTES,
  compactAiAdvisorContext,
  collectAiAdvisorContextRefs
} from "../cloudflare/src/ai-advisor-context-compaction.js";

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");

const hugeText="x".repeat(1200);
const context={
  contextAvailability:{financeAndBusiness:"available",financeAndBusinessComplete:true,financeAndBusinessReason:null},
  profile:{industry:"services",employeeCount:42,town:"Gaborone"},
  workspaceVersion:19,
  market:{code:"BW",country:"Botswana",currency:"BWP",timeZone:"Africa/Gaborone"},
  language:{primary:"en"},
  protection:{ref:"SCORE-1",score:81,grade:"B",capturedAt:"2026-10-11T08:00:00Z",dimensions:Object.fromEntries(Array.from({length:80},(_,i)=>[`d${i}`,hugeText]))},
  finance:{ref:"FIN-1",currency:"BWP",cashPositionMinor:250000,lastImportAt:"2026-10-11T07:00:00Z",unresolvedReconciliations:2,unresolvedExposureMinor:2000,outstandingMinor:9000,overdueMinor:3000,topReceivables:Array.from({length:20},(_,i)=>({customerName:`Customer ${i} ${hugeText}`,outstandingMinor:i*100,overdueMinor:i*10}))},
  propertyContext:{ref:"PROP-1",available:true,restricted:false,metrics:Object.fromEntries(Array.from({length:50},(_,i)=>[`m${i}`,hugeText])),items:Array.from({length:20},(_,i)=>({name:`Property ${i} ${hugeText}`,type:"commercial",status:"active",location:hugeText}))},
  businessMemory:{ref:"BIZ-1",businessDate:"2026-10-11",identity:Object.fromEntries(Array.from({length:60},(_,i)=>[`identity${i}`,hugeText])),ownerEnteredMemory:Object.fromEntries(Array.from({length:100},(_,i)=>[`memory${i}`,hugeText])),language:{primary:"en"},sales:{records:Array.from({length:100},(_,i)=>({id:i,note:hugeText}))},analytics:{series:Array.from({length:100},(_,i)=>({id:i,note:hugeText}))},spendEnvelope:{ready:true,warnings:Array.from({length:30},()=>hugeText)},provenanceRule:hugeText},
  obligations:Array.from({length:12},(_,i)=>({ref:`OBL-${i+1}`,title:`Obligation ${i} ${hugeText}`,status:"open",priority:i<2?1:2,dueAt:"2026-10-20",sourceRefs:[`SRC-${(i%6)+1}`]})),
  risks:Array.from({length:10},(_,i)=>({ref:`RISK-${i+1}`,title:`Risk ${i} ${hugeText}`,severity:"high",status:"open",recommendedAction:hugeText})),
  controls:Array.from({length:10},(_,i)=>({ref:`CTRL-${i+1}`,name:`Control ${i} ${hugeText}`,status:"attention",evidenceHealth:"review"})),
  tenders:Array.from({length:8},(_,i)=>({ref:`TND-${i+1}`,title:`Tender ${i} ${hugeText}`,issuer:hugeText,status:"open",mandatoryCount:10,missingRequired:2})),
  cipa:{ref:"CIPA-1",snapshotAvailable:true,observedAt:"2026-10-10T12:00:00Z"},
  operations:{ref:"OPS-1",date:"2026-10-11",coverage:88},
  sources:Array.from({length:20},(_,i)=>({ref:`SRC-${i+1}`,authority:"Authority",title:`Source ${i} ${hugeText}`,url:`https://example.test/${i}/${hugeText}`,effectiveDate:"2026-01-01",verificationStatus:"verified"}))
};

const first=compactAiAdvisorContext(context);
const second=compactAiAdvisorContext(context);
assert.equal(first.compaction.applied,true,"oversized context must compact instead of throwing");
assert.ok(first.bytes<=AI_ADVISOR_CONTEXT_MAX_BYTES,`compacted context must fit ${AI_ADVISOR_CONTEXT_MAX_BYTES} bytes`);
assert.ok(first.originalBytes>AI_ADVISOR_CONTEXT_MAX_BYTES,"fixture must genuinely exceed the context ceiling");
assert.equal(first.serialized,second.serialized,"compaction must be deterministic");
assert.deepEqual(first.compaction,second.compaction,"compaction metadata must be deterministic");
assert.equal(first.context.contextAvailability.contextCompaction,"compacted");
assert.equal(first.context.contextAvailability.contextComplete,false,"size-limited context must not claim completeness");
assert.equal(first.context.contextAvailability.financeAndBusiness,"available","compaction must not masquerade as a backend outage");
assert.equal(first.context.businessMemory?.businessDate,"2026-10-11","business freshness must survive compaction");
assert.equal(first.context.operations?.date,"2026-10-11","operations freshness must survive compaction");
assert.ok(collectAiAdvisorContextRefs(first.context).has("OBL-1"),"retained authoritative records must keep stable refs");
assert.ok(collectAiAdvisorContextRefs(first.context).has("SRC-1"),"retained provenance refs must survive compaction");

const small={contextAvailability:{financeAndBusiness:"role_restricted",financeAndBusinessComplete:false,financeAndBusinessReason:"role_restricted"},profile:{industry:"services"},obligations:[],risks:[],controls:[],tenders:[],sources:[]};
const uncompressed=compactAiAdvisorContext(small);
assert.equal(uncompressed.compaction.applied,false);
assert.equal(uncompressed.serialized,JSON.stringify(small));
assert.equal(uncompressed.context.contextAvailability.financeAndBusiness,"role_restricted");

assert.match(worker,/compactAiAdvisorContext\(context,\{maxBytes:AI_ADVISOR_CONTEXT_MAX_BYTES\}\)/);
assert.match(worker,/collectAiAdvisorContextRefs\(compacted\.context\)/);
assert.doesNotMatch(worker,/if\(bytes>24576\)throw new Error\("ai_advisor_context_limit_exceeded"\)/);
assert.match(worker,/reason:"business_context_unavailable"/);
assert.match(worker,/financeAndBusinessReason/);
assert.match(worker,/contextAvailability:bundle\.context\.contextAvailability/);
assert.match(worker,/contextCompaction:bundle\.compaction/);
assert.match(worker,/contextOriginalBytes:bundle\.originalBytes/);
assert.match(worker,/contextAvailability\.contextCompaction is compacted/);
assert.match(worker,/some live business context could not be retrieved; this is not a complete workspace review/);

assert.match(owner,/function advisorContextNotice\(result\)/);
assert.match(owner,/Live workspace context is incomplete/);
assert.match(owner,/Lower-priority context was compacted/);
assert.match(owner,/workspace context is partial/);

console.log("v329 AI advisor context compaction and disclosure: PASS");
