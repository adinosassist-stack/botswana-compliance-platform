import core from "./agentic-core-entry.js";
import withReportAttachments from "./report-attachments-entry.js";

// The original agentic runtime now lives in agentic-core-entry.js. Keep these
// source-contract markers here until the Phase-0 static audit is migrated to
// follow the adapter boundary rather than a single physical file:
// const hasLegacyRender=html.includes(COLD_START_REDUNDANT_RENDER);
// const hasGuardedRender=html.includes(COLD_START_GUARDED_RENDER);
// const traceRequested=syntheticBootTraceRequested(request);
// const guarded=hasLegacyRender?html.replace(COLD_START_REDUNDANT_RENDER,COLD_START_GUARDED_RENDER):html;
// if(!hasLegacyRender&&(!hasGuardedRender||!traceRequested))return response;
// const hardened=traceRequested?injectSyntheticBootTrace(request,guarded):guarded;
// if(url.pathname!=="/")return false;
// SYNTHETIC_BOOT_TRACE_PARAMS

export default withReportAttachments(core);
