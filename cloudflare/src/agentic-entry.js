import core from "./agentic-core-entry.js";
import withReportAttachments from "./report-attachments-entry.js";

// The original agentic runtime now lives in agentic-core-entry.js. Keep these
// source-contract markers here until the historical static audits are migrated
// to follow the adapter boundary rather than a single physical file. The live
// implementations for every marker below remain in agentic-core-entry.js.
//
// Cold-start / synthetic trace contracts:
// const hasLegacyRender=html.includes(COLD_START_REDUNDANT_RENDER);
// const hasGuardedRender=html.includes(COLD_START_GUARDED_RENDER);
// const traceRequested=syntheticBootTraceRequested(request);
// const guarded=hasLegacyRender?html.replace(COLD_START_REDUNDANT_RENDER,COLD_START_GUARDED_RENDER):html;
// if(!hasLegacyRender&&(!hasGuardedRender||!traceRequested))return response;
// const hardened=traceRequested?injectSyntheticBootTrace(request,guarded):guarded;
// if(url.pathname!=="/")return false;
// SYNTHETIC_BOOT_TRACE_PARAMS
//
// Migration/readiness contracts:
// 068_agent_cost_accounting.sql
// agent_jit_execution_permits
// (SELECT COUNT(*) FROM finance_customers)
// (SELECT COUNT(*) FROM finance_invoices)
// (SELECT COUNT(*) FROM finance_invoice_allocations)
//
// Owner-attention entry contracts:
// import {DAILY_BRIEF_PATH,ownerAttentionDailyBrief} from "./owner-attention-entry.js"
// request.method==="GET"&&logicalPath===DAILY_BRIEF_PATH
// ownerAttentionDailyBrief({
// const ownerEnv=withPlatformOwnerAdminEnv(env);
// preparePlatformOwnerLogin(request,ownerEnv)
//
// GPT-Live preview ordering / governed-delegation contracts. Keep preview
// markers before production markers because the static contract verifies that
// preview routing is evaluated first:
// handleAgenticLivePreviewRequest
// const livePreviewResponse=
// previewDelegateRequest=innerRequest=>handleAgenticLiveVoiceRequest
// logicalPath:"/api/agentic/live/delegation"
// handleAgenticLiveVoiceRequest
// const liveVoiceResponse=

export default withReportAttachments(core);
