// Authorize only exact private-staging Workspace Agent API transport.
// This is an ingress boundary, not authentication: session/tenant/role checks
// remain mandatory inside workspace-agent-tasks-api.js. Production fails closed.
const API_PATHS=Object.freeze(new Set([
  "/api/agentic/workspace-identity",
  "/api/agentic/workspace-tasks"
]));
const HOST_FORMAT=/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.thebedesk\.com$/;
export function isWorkspaceAgentAdvisoryPath(path) {
  return typeof path==="string" && API_PATHS.has(path);
}
export function workspaceAgentAdvisoryApiAllowed({env,request,logicalPath}={}) {
  if(!isWorkspaceAgentAdvisoryPath(logicalPath))return false;
  if(env?.APP_ENV!=="staging" ||
      env?.WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED!=="true" ||
      request?.method!=="GET")return false;
  let url;
  try { url=new URL(request.url); } catch { return false; }
  // Disallow alternate API tunnels even if their logicalPath was rewritten.
  // Do not grant staging API access via production apex/www/workers.dev.
  if(url.pathname!==logicalPath ||
      url.protocol!=="https:" || url.username || url.password || url.port)return false;
  const host=url.hostname.toLowerCase();
  if(!HOST_FORMAT.test(host) || host==="www.thebedesk.com")return false;
  const configuredHost=env?.WORKSPACE_AGENT_ADVISORY_STAGING_HOST;
  if(typeof configuredHost!=="string" || !configuredHost ||
      configuredHost!==configuredHost.trim() ||
      configuredHost.toLowerCase()!==host)return false;
  return true;
}
