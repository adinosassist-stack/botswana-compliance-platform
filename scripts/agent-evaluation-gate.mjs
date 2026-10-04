import fs from "node:fs";
import {runAgentEvaluationSuite} from "../cloudflare/src/agent-evaluation.js";
import {runVoiceRuntimeEvaluationGate} from "../cloudflare/src/voice-runtime-evaluation.js";
import {verifyVoiceProviderRoutingPolicy} from "../cloudflare/src/voice-provider-routing.js";

const report=runAgentEvaluationSuite();
if(!report.pass){
  const failed=report.results.filter(item=>!item.pass).map(item=>({
    id:item.id,
    expected:item.expect,
    actual:{allowed:item.actual?.allowed,executionAllowed:item.actual?.executionAllowed,code:item.actual?.code}
  }));
  console.error(JSON.stringify({
    gate:"agent-evaluation",
    suiteVersion:report.suiteVersion,
    total:report.total,
    failed:report.failed,
    falseAllows:report.falseAllows,
    executionEscapes:report.executionEscapes,
    scenarios:failed
  },null,2));
  process.exit(1);
}

const voiceSource=fs.readFileSync(new URL("../cloudflare/src/agentic-live-voice.js",import.meta.url),"utf8");
const voice=runVoiceRuntimeEvaluationGate({source:voiceSource});
if(!voice.pass){
  console.error(JSON.stringify({
    gate:"voice-runtime-evaluation",
    version:voice.version,
    productionBoundary:voice.production,
    candidate:voice.candidate,
    thresholds:voice.thresholds,
    evidenceStates:voice.evidenceStates
  },null,2));
  process.exit(1);
}

const routing=verifyVoiceProviderRoutingPolicy();
if(!routing.pass){
  console.error(JSON.stringify({
    gate:"voice-provider-routing",
    version:routing.version,
    routes:routing.routes
  },null,2));
  process.exit(1);
}

console.log(JSON.stringify({
  gate:"agent-evaluation",
  suiteVersion:report.suiteVersion,
  total:report.total,
  passed:report.passed,
  falseAllows:report.falseAllows,
  executionEscapes:report.executionEscapes,
  voiceRuntime:{
    version:voice.version,
    productionModel:"gpt-realtime-2.1",
    candidateModel:voice.candidate.model,
    candidateActivation:voice.candidate.activation,
    promotionEvidenceRequired:true,
    productionRoutingPinned:routing.routes.productionCandidateRequest.code==="production_profile_pinned",
    candidateReviewPermitRequired:routing.routes.noReviewPermit.code==="voice_candidate_review_permit_required",
    status:"PASS"
  },
  status:"PASS"
}));
