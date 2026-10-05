import fs from "node:fs";
import {runAgentEvaluationSuite} from "../cloudflare/src/agent-evaluation.js";
import {runVoiceRuntimeEvaluationGate} from "../cloudflare/src/voice-runtime-evaluation.js";
import {verifyVoiceProviderRoutingPolicy} from "../cloudflare/src/voice-provider-routing.js";
import {verifyVoiceRuntimeEvidencePolicy} from "../cloudflare/src/voice-runtime-evidence.js";

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

try{
  await import(new URL("../tests/v217-jit-execution-permit.mjs",import.meta.url));
  await import(new URL("../tests/v281-jit-expiry-no-side-effect.mjs",import.meta.url));
}catch(error){
  console.error(JSON.stringify({
    gate:"jit-execution-permit-safety",
    error:String(error?.stack||error?.message||error)
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

const evidence=verifyVoiceRuntimeEvidencePolicy();
if(!evidence.pass){
  console.error(JSON.stringify({
    gate:"voice-runtime-evidence",
    version:evidence.version,
    minimums:evidence.minimums,
    cases:evidence.cases
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
  jitExecutionPermitSafety:{
    v217:"PASS",
    expiredPermitNoSideEffectV281:"PASS"
  },
  voiceRuntime:{
    version:voice.version,
    productionModel:"gpt-realtime-2.1",
    candidateModel:voice.candidate.model,
    candidateActivation:voice.candidate.activation,
    promotionEvidenceRequired:true,
    evidenceMinimums:evidence.minimums,
    evidenceVolumeRequired:evidence.cases.insufficient.code==="evaluation_evidence_volume_required",
    productionRoutingPinned:routing.routes.productionCandidateRequest.code==="production_profile_pinned",
    candidateReviewPermitRequired:routing.routes.noReviewPermit.code==="voice_candidate_review_permit_required",
    status:"PASS"
  },
  status:"PASS"
}));
