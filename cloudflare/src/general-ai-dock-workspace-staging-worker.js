import workspace from "./release-governance-entry.js";
import {handleStagingDockResearch} from "./general-ai-dock-staging-entry.js";

// This entrypoint is for the protected staging workspace build only.
export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (env?.APP_ENV !== "staging" || url.origin !== env.DOCK_STAGING_WORKSPACE_ORIGIN) {
      return new Response(null, {status: 404, headers: {"cache-control": "no-store"}});
    }
    if (url.pathname === "/api/ai/general") return handleStagingDockResearch(request, env);
    return workspace.fetch(request, env, ctx);
  }
};
