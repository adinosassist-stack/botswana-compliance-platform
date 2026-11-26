import {relayStagingDockResearch} from "./general-ai-dock-staging-relay.js";
import {verifyDockResearchFixture} from "./general-ai-staging-entry.js";

// Compose into the authenticated staging workspace only.
export function handleStagingDockResearch(request, env) {
  return relayStagingDockResearch(request, {
    environment: env?.APP_ENV,
    enabled: env?.DOCK_STAGING_RESEARCH_ENABLED === "true",
    workspaceOrigin: env?.DOCK_STAGING_WORKSPACE_ORIGIN,
    authorizeSyntheticSession: ({csrf}) => verifyDockResearchFixture(request, env, csrf),
    service: env?.STAGING_AI
  });
}
