import fs from "node:fs";

function replaceOnce(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`missing_patch_anchor:${label}`);
  if(source.indexOf(oldText,first+1)>=0)throw new Error(`ambiguous_patch_anchor:${label}`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

const corePath="cloudflare/src/agentic-core.js";
let core=fs.readFileSync(corePath,"utf8");
core=replaceOnce(core,
`async function runAdvisor({request,env,ctx,coreFetch,runId,goal,observation,orchestration,readTools,continuationContext=null}){`,
`function advisorContextDisclosure(data){
  const rawAvailability=data?.contextAvailability&&typeof data.contextAvailability==="object"?data.contextAvailability:{};
  const rawState=text(rawAvailability.financeAndBusiness,40).toLowerCase();
  const financeAndBusiness=["available","unavailable","role_restricted"].includes(rawState)?rawState:"unknown";
  const rawCompaction=data?.contextCompaction&&typeof data.contextCompaction==="object"?data.contextCompaction:{};
  const contextCompaction=Object.freeze({
    applied:rawCompaction.applied===true,
    stage:text(rawCompaction.stage,40)||null
  });
  const reason=text(rawAvailability.financeAndBusinessReason,120)||
    (financeAndBusiness==="unknown"?"advisor_context_unverified":null);
  return Object.freeze({
    contextAvailability:Object.freeze({
      financeAndBusiness,
      financeAndBusinessComplete:rawAvailability.financeAndBusinessComplete===true,
      financeAndBusinessReason:reason,
      contextCompaction:text(rawAvailability.contextCompaction,40)||null,
      contextComplete:rawAvailability.contextComplete===true
    }),
    contextCompaction
  });
}

async function runAdvisor({request,env,ctx,coreFetch,runId,goal,observation,orchestration,readTools,continuationContext=null}){`,
"advisor_disclosure_helper"
);
core=replaceOnce(core,
`    if(!response.ok)return {result:deterministicFallback(observation),generationMode:"deterministic_fallback",advisorStatus:response.status};`,
`    if(!response.ok){
      const disclosure=advisorContextDisclosure(null);
      return {result:deterministicFallback(observation),...disclosure,generationMode:"deterministic_fallback",advisorStatus:response.status};
    }`,
"advisor_non_ok"
);
core=replaceOnce(core,
`    if(!result||typeof result!=="object")return {result:deterministicFallback(observation),generationMode:"deterministic_fallback",advisorStatus:200};`,
`    if(!result||typeof result!=="object"){
      const disclosure=advisorContextDisclosure(data);
      return {result:deterministicFallback(observation),...disclosure,generationMode:"deterministic_fallback",advisorStatus:200};
    }`,
"advisor_invalid_result"
);
core=replaceOnce(core,
`    return {result,references,generationMode:data.generationMode==="workers_ai"?"governed_ai_advisor":"deterministic_fallback",advisorStatus:200};`,
`    const contextDisclosure=advisorContextDisclosure(data);
    return {result,references,contextAvailability:contextDisclosure.contextAvailability,contextCompaction:contextDisclosure.contextCompaction,generationMode:data.generationMode==="workers_ai"?"governed_ai_advisor":"deterministic_fallback",advisorStatus:200};`,
"advisor_success_metadata"
);
core=replaceOnce(core,
`  }catch{
    return {result:deterministicFallback(observation),generationMode:"deterministic_fallback",advisorStatus:0};
  }`,
`  }catch{
    const disclosure=advisorContextDisclosure(null);
    return {result:deterministicFallback(observation),...disclosure,generationMode:"deterministic_fallback",advisorStatus:0};
  }`,
"advisor_exception_metadata"
);
core=replaceOnce(core,
`    run:{id:runId,goal,status:"completed",generationMode:advisor.generationMode,confidence,summary,observation},`,
`    run:{id:runId,goal,status:"completed",generationMode:advisor.generationMode,confidence,summary,contextAvailability:advisor.contextAvailability||null,contextCompaction:advisor.contextCompaction||null,observation},`,
"plan_context_metadata"
);
fs.writeFileSync(corePath,core);

const voicePath="cloudflare/src/agentic-live-voice.js";
let voice=fs.readFileSync(voicePath,"utf8");
voice=replaceOnce(voice,
`function spokenResult(plan){`,
`function spokenContextNotice(plan){
  const state=cleanText(plan?.run?.contextAvailability?.financeAndBusiness,40).toLowerCase();
  const notices=[];
  if(state==="unavailable")notices.push("Some live workspace context was unavailable, so this is not a complete workspace review.");
  else if(state==="role_restricted")notices.push("This review is limited to the workspace context permitted for this role.");
  else if(state!=="available")notices.push("Workspace context completeness could not be verified, so confirm the supporting records before relying on a full business overview.");
  if(plan?.run?.contextCompaction?.applied===true)notices.push("Some lower-priority workspace context was compacted to stay within the bounded AI context; cited and retained records remain the basis for this review.");
  return cleanText(notices.join(" "),700);
}

function spokenResult(plan){`,
"voice_context_notice_helper"
);
voice=replaceOnce(voice,
`  const parts=[summary];
  if(proposals.length)parts.push(\`The main next steps are: \${proposals.join(" ")}\`);
  parts.push("No business action was executed from this voice delegation.");`,
`  const parts=[summary];
  if(proposals.length)parts.push(\`The main next steps are: \${proposals.join(" ")}\`);
  const contextNotice=spokenContextNotice(plan);
  if(contextNotice)parts.push(contextNotice);
  parts.push("No business action was executed from this voice delegation.");`,
"voice_spoken_notice"
);
voice=replaceOnce(voice,
`    proposalCount:Array.isArray(plan?.proposals)?plan.proposals.length:0,
    executionPerformed:false`,
`    proposalCount:Array.isArray(plan?.proposals)?plan.proposals.length:0,
    contextAvailability:cleanText(plan?.run?.contextAvailability?.financeAndBusiness,40)||null,
    contextCompacted:plan?.run?.contextCompaction?.applied===true,
    executionPerformed:false`,
"voice_audit_context"
);
voice=replaceOnce(voice,
`    proposalIds:(Array.isArray(plan?.proposals)?plan.proposals:[]).map(item=>item?.id).filter(Boolean),
    content,
    toolOutput:{
      ok:true,
      runId:plan?.run?.id||null,
      content,
      authority
    },`,
`    proposalIds:(Array.isArray(plan?.proposals)?plan.proposals:[]).map(item=>item?.id).filter(Boolean),
    content,
    contextAvailability:plan?.run?.contextAvailability||null,
    contextCompaction:plan?.run?.contextCompaction||null,
    toolOutput:{
      ok:true,
      runId:plan?.run?.id||null,
      content,
      contextAvailability:plan?.run?.contextAvailability||null,
      contextCompaction:plan?.run?.contextCompaction||null,
      authority
    },`,
"voice_response_context"
);
voice=replaceOnce(voice,
`  marketingRealtimeSessionConfig,
  spokenResult,`,
`  marketingRealtimeSessionConfig,
  spokenContextNotice,
  spokenResult,`,
"voice_test_export"
);
fs.writeFileSync(voicePath,voice);

console.log("VOICE_CONTEXT_DISCLOSURE_PATCH_APPLIED");
