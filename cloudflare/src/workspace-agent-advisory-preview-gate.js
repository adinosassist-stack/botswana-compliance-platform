// Hardened, default-deny preview gate for the Workspace Agent's advisory dock.
// This is NOT an activation control plane: never use it to deploy, execute tasks,
// grant permissions, bypass owner/reviewer release gates, or change production.
const STAGING_HOST_SUFFIX = ".thebedesk.com";
const HOST_FORMAT = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.thebedesk\.com$/;

export function workspaceAgentAdvisoryPreviewAllowed({
  env, request, probeRole, initialIdentity
} = {}) {
  // A mistakenly persisted remote feature flag must never enable production.
  if (env?.APP_ENV !== "staging" ||
      env?.WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED !== "true") return false;
  if (!(initialIdentity && (probeRole==="owner"||probeRole==="manager"))) return false;
  if (typeof initialIdentity?.user?.id !== "string" ||
      !initialIdentity.user.id.trim() ||
      typeof initialIdentity?.csrfToken !== "string" ||
      initialIdentity.csrfToken.length < 16) return false;
  if (request?.method !== "GET") return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  if (!/^\/app\/?$/.test(url.pathname) ||
      url.protocol !== "https:" || url.username || url.password ||
      url.port) return false;
  const host = url.hostname.toLowerCase();
  if (!host.endsWith(STAGING_HOST_SUFFIX) ||
      !HOST_FORMAT.test(host) ||
      host === "www.thebedesk.com") return false;
  // Explicit, exact staging hostname is required; workers.dev, preview URLs,
  // production apex/www and other subdomains are denied, even with the flag on.
  const configuredHost = env?.WORKSPACE_AGENT_ADVISORY_STAGING_HOST;
  if (typeof configuredHost !== "string" ||
      configuredHost !== configuredHost.trim() ||
      configuredHost.toLowerCase() !== host) return false;
  return true;
}
