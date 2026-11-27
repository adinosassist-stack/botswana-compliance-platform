import {handleDockStagingAdmission} from "./general-ai-dock-staging-admission.js";
import {handleAgenticLiveVoiceRequest} from "./agentic-live-voice.js";
import workspace from "./release-governance-entry.js";
import {readDockResearchFixture} from "./general-ai-staging-entry.js";
import {handleStagingDockResearch} from "./general-ai-dock-staging-entry.js";

// This entrypoint is for the protected staging workspace build only.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (env?.APP_ENV !== "staging" || url.origin !== env.DOCK_STAGING_WORKSPACE_ORIGIN) {
      return new Response(null, {status: 404, headers: {"cache-control": "no-store"}});
    }
    if (url.pathname === "/dock-staging/sign-in") return handleDockStagingAdmission(request, env);
    if (env.DOCK_STAGING_ADMISSION_ENABLED === "true") {
      const sessionCookies = (request.headers.get("cookie") ?? "").split(";")
        .map(cookie => cookie.trim())
        .filter(cookie => /^(?:__Host-bw_session|bw_session)\s*=/.test(cookie));
      if (sessionCookies.some(cookie => !/^(?:__Host-bw_session|bw_session)=[a-f0-9]{64}$/.test(cookie))) {
        return new Response(null, {status: 401, headers: {"cache-control": "no-store"}});
      }
    }
    if (url.pathname === "/api/ai/general") return handleStagingDockResearch(request, env);
    if (url.pathname.startsWith("/api/agentic/live/")) {
      const allowedRoute =
        (url.pathname === "/api/agentic/live/status" && request.method === "GET") ||
        (url.pathname === "/api/agentic/live/session" && request.method === "POST");
      if (!allowedRoute || env.THEBE_LIVE_VOICE_ENABLED !== "true") {
        return new Response(null, {status: 404, headers: {"cache-control": "no-store"}});
      }
      const fixture = await readDockResearchFixture(request, env).catch(() => null);
      if (!fixture) {
        return new Response(null, {status: 401, headers: {"cache-control": "no-store"}});
      }
      return handleAgenticLiveVoiceRequest({request, env, dockStagingOnly: true});
    }
    const response = await workspace.fetch(request, env, ctx);
    if (request.method !== "GET" || url.pathname !== "/app/" || !response.ok ||
        !response.headers.get("content-type")?.toLowerCase().startsWith("text/html") ||
        env.DOCK_STAGING_RESEARCH_ENABLED !== "true" || typeof env.STAGING_AI?.fetch !== "function") {
      return response;
    }

    const fixture = await readDockResearchFixture(request, env).catch(() => null);
    if (!fixture) return response;

    const headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-store");
    headers.delete("etag");
    headers.delete("content-length");
    const html = new Response(response.body, {status: response.status, headers});
    return new HTMLRewriter().on("head", {
      element(head) {
        head.prepend('<meta name="thebe-general-ai-enabled" content="true">' +
          '<meta name="thebe-general-ai-research-enabled" content="true">', {html: true});
      }
    }).transform(html);
  }
};
