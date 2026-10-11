import fs from "node:fs";

function replaceOnce(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`missing_patch_anchor:${label}`);
  if(source.indexOf(oldText,first+1)>=0)throw new Error(`ambiguous_patch_anchor:${label}`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

const workerPath="cloudflare/src/worker.js";
let worker=fs.readFileSync(workerPath,"utf8");
worker=replaceOnce(worker,
  'import {handlePropertyValuationServicesRequest} from "./property-valuation-services.js";\n',
  'import {handlePropertyValuationServicesRequest} from "./property-valuation-services.js";\nimport {compactAiAdvisorContext,collectAiAdvisorContextRefs,AI_ADVISOR_CONTEXT_MAX_BYTES} from "./ai-advisor-context-compaction.js";\n',
  "worker_import"
);
worker=replaceOnce(worker,
  '  if(refs.length)lines.push(`${setswana?"Metswedi ya workspace":"Workspace sources"}: ${refs.join("; ")}.`);\n  const caveat=',
  '  if(refs.length)lines.push(`${setswana?"Metswedi ya workspace":"Workspace sources"}: ${refs.join("; ")}.`);\n  if(result?.contextAvailability?.financeAndBusiness==="unavailable")lines.push(setswana?"Tlhokomeliso: dingwe tsa dintlha tsa kgwebo ga di a kgona go bonwa; karabo eno ga se ponelopele e e feletseng ya workspace.":"Context note: some live business context could not be retrieved; this is not a complete workspace review.");\n  else if(result?.contextCompaction?.applied===true)lines.push(setswana?"Tlhokomeliso: dintlha dingwe tse di kwa tlase ka botlhokwa di khutshwafaditswe ka ntlha ya tekanyo ya context.":"Context note: lower-priority workspace context was compacted to stay within the bounded AI context.");\n  const caveat=',
  "whatsapp_context_notice"
);
worker=replaceOnce(worker,
  '  const financePromise=includeFinance\n    ?buildBusinessContext(env,tenantId,{actorRole}).then(value=>({ok:true,value}),()=>({ok:false,value:null}))\n    :Promise.resolve(null);',
  '  const financePromise=includeFinance\n    ?buildBusinessContext(env,tenantId,{actorRole}).then(value=>({ok:true,value,reason:null}),()=>({ok:false,value:null,reason:"business_context_unavailable"}))\n    :Promise.resolve(null);',
  "business_context_reason"
);
worker=replaceOnce(worker,
  '  const context={contextAvailability:{financeAndBusiness:includeFinance?(businessContextAvailable?"available":"unavailable"):"role_restricted",financeAndBusinessComplete:businessContextAvailable},profile:profile.record,workspaceVersion:Number(stateRow?.version||0),market:activeMarket,language:businessPayload?.language||{},protection,finance,propertyContext,businessMemory,obligations,risks,controls,tenders,cipa,operations,sources};',
  '  const context={contextAvailability:{\n    financeAndBusiness:includeFinance?(businessContextAvailable?"available":"unavailable"):"role_restricted",\n    financeAndBusinessComplete:businessContextAvailable,\n    financeAndBusinessReason:includeFinance?(businessContextAvailable?null:(businessContextResult?.reason||"business_context_unavailable")):"role_restricted"\n  },profile:profile.record,workspaceVersion:Number(stateRow?.version||0),market:activeMarket,language:businessPayload?.language||{},protection,finance,propertyContext,businessMemory,obligations,risks,controls,tenders,cipa,operations,sources};',
  "context_availability_reason"
);
worker=replaceOnce(worker,
  '  const allowedRefs=new Set(["SCORE-1",...obligations.map(x=>x.ref),...risks.map(x=>x.ref),...controls.map(x=>x.ref),...tenders.map(x=>x.ref),...sources.map(x=>x.ref),...(cipa?[cipa.ref]:[]),...(operations?[operations.ref]:[]),...(finance?[finance.ref]:[]),...(propertyContext?[propertyContext.ref]:[]),...(businessMemory?[businessMemory.ref]:[])]);\n',
  '',
  "old_allowed_refs"
);
worker=replaceOnce(worker,
  '  const serialized=JSON.stringify(context),bytes=enc.encode(serialized).byteLength;\n  if(bytes>24576)throw new Error("ai_advisor_context_limit_exceeded");\n  return {context,serialized,counts,allowedRefs,referenceCatalog,bytes};',
  '  const compacted=compactAiAdvisorContext(context,{maxBytes:AI_ADVISOR_CONTEXT_MAX_BYTES});\n  const allowedRefs=collectAiAdvisorContextRefs(compacted.context);\n  const compactedReferenceCatalog=referenceCatalog.filter(item=>allowedRefs.has(item.ref));\n  return {context:compacted.context,serialized:compacted.serialized,counts,allowedRefs,referenceCatalog:compactedReferenceCatalog,bytes:compacted.bytes,originalBytes:compacted.originalBytes,compaction:compacted.compaction};',
  "bounded_context"
);
worker=replaceOnce(worker,
  'If contextAvailability.financeAndBusiness is role_restricted, do not imply the caller can access owner-only financial information. If evidence is thin or conflicting, say so and lower confidence.',
  'If contextAvailability.financeAndBusiness is role_restricted, do not imply the caller can access owner-only financial information. If contextAvailability.contextCompaction is compacted, explicitly state that lower-priority workspace context was omitted to stay within the bounded AI context and do not imply a complete workspace review. If evidence is thin or conflicting, say so and lower confidence.',
  "prompt_compaction_disclosure"
);
worker=replaceOnce(worker,
  '  }else{errorCode="workers_ai_binding_not_configured";result=aiAdvisorFallback(mode,bundle)}\n  const selectedRefs=',
  '  }else{errorCode="workers_ai_binding_not_configured";result=aiAdvisorFallback(mode,bundle)}\n  const contextCaveats=[];\n  if(bundle.context?.contextAvailability?.financeAndBusiness==="unavailable")contextCaveats.push("Live Finance, Sales, Business Memory or Analytics context was unavailable; absent values were not treated as zero.");\n  if(bundle.compaction?.applied===true)contextCaveats.push("Lower-priority workspace context was compacted to stay within the bounded AI context; this is not a complete workspace review.");\n  if(contextCaveats.length){\n    result={...result,confidence:bundle.context?.contextAvailability?.financeAndBusiness==="unavailable"?"low":(result.confidence==="high"?"medium":result.confidence),caveats:[...contextCaveats,...(result.caveats||[])].slice(0,8)};\n  }\n  const selectedRefs=',
  "server_context_caveat"
);
worker=replaceOnce(worker,
  '    await writeAudit(env,a.tenant_id,a.user_id,"AI_BUSINESS_ADVISOR_RUN",{runId,mode,generationMode,contextCounts:bundle.counts,contextBytes:bundle.bytes,sourceCount:references.length,creditsUsed});',
  '    await writeAudit(env,a.tenant_id,a.user_id,"AI_BUSINESS_ADVISOR_RUN",{runId,mode,generationMode,contextCounts:bundle.counts,contextBytes:bundle.bytes,contextOriginalBytes:bundle.originalBytes,contextCompaction:bundle.compaction,sourceCount:references.length,creditsUsed});',
  "audit_compaction"
);
worker=replaceOnce(worker,
  '  return {runId,generationMode,model:usedModel,creditsUsed,contextCounts:bundle.counts,references,language:bundle.context.language||{},...result};',
  '  return {runId,generationMode,model:usedModel,creditsUsed,contextCounts:bundle.counts,contextAvailability:bundle.context.contextAvailability||{},contextCompaction:bundle.compaction,references,language:bundle.context.language||{},...result};',
  "response_context_metadata"
);
fs.writeFileSync(workerPath,worker);

const ownerPath="public/js/owner-command-centre.js";
let owner=fs.readFileSync(ownerPath,"utf8");
owner=replaceOnce(owner,
  '  async function askThebe(question){\n',
  '  function advisorContextNotice(result){\n    const availability=String(result?.contextAvailability?.financeAndBusiness||"");\n    if(availability==="unavailable")return "Live workspace context is incomplete. Finance, Sales, Business Memory or Analytics could not be retrieved, so verify before relying on a full business overview.";\n    if(result?.contextCompaction?.applied===true)return "This answer used a bounded workspace snapshot. Lower-priority context was compacted to stay within the AI context limit; cited sources remain available for verification.";\n    return "";\n  }\n\n  async function askThebe(question){\n',
  "owner_context_notice_helper"
);
owner=replaceOnce(owner,
  '      const refreshedStatus=agenticStatusNode();\n      if(refreshedStatus)refreshedStatus.textContent="Answer ready · no action was executed.";',
  '      const refreshedStatus=agenticStatusNode();\n      if(refreshedStatus){\n        const contextNotice=advisorContextNotice(agenticAskResult);\n        refreshedStatus.textContent=contextNotice?"Answer ready · workspace context is partial · no action was executed.":"Answer ready · no action was executed.";\n      }',
  "owner_answer_status"
);
owner=replaceOnce(owner,
  '        text("p",String(result.answer),"owner-agentic-reason")\n      );\n\n      const references=',
  '        text("p",String(result.answer),"owner-agentic-reason")\n      );\n      const contextNotice=advisorContextNotice(result);\n      if(contextNotice)card.append(text("div",contextNotice,"owner-agentic-policy"));\n\n      const references=',
  "owner_answer_card"
);
fs.writeFileSync(ownerPath,owner);

console.log("AI_CONTEXT_PATCH_APPLIED");
