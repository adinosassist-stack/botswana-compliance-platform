/** Read-only Workspace Agent qualification. No credentials, network or deployment. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const FILES = Object.freeze({
  production:"cloudflare/wrangler.toml",
  server:"cloudflare/src/release-governance-entry.js",
  stagingGate:"cloudflare/src/workspace-agent-advisory-preview-gate.js",
  apiEntry:"cloudflare/src/agentic-entry.js",
  apiGate:"cloudflare/src/workspace-agent-api-staging-gate.js",
  worker:"cloudflare/src/workspace-agent-tasks-api.js",
  node:"server/server.js",
  nodePrivate:"server/workspace-agent-node-private.js",
  client:"public/js/workspace-agent-app-shell.js",
  browser:"tests/workspace-agent-app-shell-browser.mjs",
  chromium:".github/workflows/workspace-agent-app-shell-browser.yml"
});
const ok = (code, passed) => ({ code, passed:passed === true });

export function readWorkspaceAgentSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key,path])=>[
    key, readFileSync(new URL("../"+path,import.meta.url),"utf8")
  ]));
}
export function qualifyWorkspaceAgentOffline(sources) {
  const p=String(sources?.production||"");
  const s=String(sources?.server||"");
  const stagingGate=String(sources?.stagingGate||"");
  const apiEntry=String(sources?.apiEntry||"");
  const apiGate=String(sources?.apiGate||"");
  const w=String(sources?.worker||"");
  const n=String(sources?.node||"");
  const privateNode=String(sources?.nodePrivate||"");
  const c=String(sources?.client||"");
  const b=String(sources?.browser||"");
  const ci=String(sources?.chromium||"");
  const checks=[
    ok("production_config_has_no_enabled_agent_flag",
      !/^\s*WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED\s*=\s*["']true["']/m.test(p)),
    ok("production_release_entry_denies_advisory_api_before_conversion",
      s.includes('import {denyUnqualifiedWorkspaceAgentApi} from "./workspace-agent-api-staging-gate.js"')&&
      apiGate.includes("export function denyUnqualifiedWorkspaceAgentApi(")&&
      (()=>{
        const outer=s.slice(s.lastIndexOf("export default {"));
        const denied=outer.indexOf("const denied=denyUnqualifiedWorkspaceAgentApi({env,request,logicalPath:path});");
        const returned=outer.indexOf("if(denied)return denied;");
        const conversion=outer.indexOf("await handleConversionEvent({request,path,env,ctx})");
        const downstream=outer.indexOf("await base.fetch(request,downstreamEnv,ctx)");
        return denied>=0 && returned>denied && conversion>returned && downstream>conversion;
      })()),
    ok("app_module_requires_explicit_server_flag",
      s.includes("workspaceAgentAdvisoryPreviewAllowed({env,request,probeRole,initialIdentity})")&&
      stagingGate.includes('env?.APP_ENV !== "staging"')&&
      stagingGate.includes('env?.WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED !== "true"')),
    ok("app_module_requires_exact_staging_host",
      stagingGate.includes("WORKSPACE_AGENT_ADVISORY_STAGING_HOST")&&
      stagingGate.includes("configuredHost.toLowerCase() !== host")&&
      stagingGate.includes("url.protocol !== \"https:\"")&&
      stagingGate.includes("request?.method !== \"GET\"")),
    ok("app_module_restricted_to_server_authenticated_owner_manager",
      stagingGate.includes('initialIdentity &&')&&stagingGate.includes('(probeRole==="owner"||probeRole==="manager")')),
    ok("app_module_injected_as_module_not_inline_runtime",
      s.includes('type="module" src="${WORKSPACE_AGENT_ADVISORY_BOOT_SCRIPT}"')),
    ok("node_candidate_registered_only_in_explicit_private_test_env",
      n.includes("registerPrivateNodeWorkspaceAgent({")&&
      n.includes('enabled:process.env.WORKSPACE_AGENT_NODE_PRIVATE_TEST_ENABLED==="true"')&&
      privateNode.includes('appEnv !== "test" || enabled !== true')&&
      privateNode.includes('req.auth')&&
      privateNode.includes('tenant_id=$1 AND workspace=$2')),
    ok("agent_api_denied_at_outermost_entry_before_other_handlers",
      apiEntry.includes("import {isWorkspaceAgentAdvisoryPath,workspaceAgentAdvisoryApiAllowed,denyUnqualifiedWorkspaceAgentApi}")&&
      apiGate.includes("export function denyUnqualifiedWorkspaceAgentApi(")&&
      apiGate.includes("if(!isWorkspaceAgentAdvisoryPath(logicalPath))return null;")&&
      apiGate.includes("if(workspaceAgentAdvisoryApiAllowed({env,request,logicalPath}))return null;")&&
      (()=>{
        const outer=apiEntry.slice(apiEntry.lastIndexOf("export default {"));
        const denied=outer.indexOf("const denied=denyUnqualifiedWorkspaceAgentApi({env,request,logicalPath});");
        const returnDenied=outer.indexOf("if(denied)return denied;");
        const downstream=outer.indexOf("await guardPausedWorkspaceWrites(");
        const handler=outer.indexOf("attachmentRuntime.fetch(");
        return denied>=0 && returnDenied>denied && downstream>returnDenied && handler>downstream;
      })()),
    ok("agent_api_not_exposed_outside_exact_private_staging",
      apiEntry.includes("if(isWorkspaceAgentAdvisoryPath(logicalPath))")&&
      apiEntry.includes("if(!workspaceAgentAdvisoryApiAllowed({env,request,logicalPath}))")&&
      apiGate.includes('env?.APP_ENV!=="staging"')&&
      apiGate.includes('env?.WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED!=="true"')&&
      apiGate.includes('request?.method!=="GET"')&&
      apiGate.includes('url.pathname!==logicalPath')&&
      apiGate.includes('url.protocol!=="https:"')&&
      apiGate.includes("configuredHost.toLowerCase()!==host")),
    ok("agent_identity_and_tasks_get_only",
      w.includes('"/api/agentic/workspace-identity"')&&
      w.includes('"/api/agentic/workspace-tasks"')&&
      w.includes('request.method !== "GET"')&&
      w.includes('roleAllowed(auth, "owner", "manager")')),
    ok("agent_tasks_bound_to_authenticated_tenant",
      w.includes('.bind(auth.tenant_id, workspace)')),
    ok("app_shell_checks_same_origin_session_before_agent",
      c.includes('fetchImpl("/api/auth/me"')&&c.includes('credentials: "same-origin"')&&
      c.includes('cache: "no-store"')&&c.includes('activateFromTrustedShell')),
    ok("browser_coverage_contains_tenant_switch_expiry_and_no_writes",
      b.includes('state.tenantId="tenant-B"')&&b.includes('state.role="unauthenticated"')&&
      b.includes('state.writes,[]')),
    ok("chromium_workflow_runs_browser_fixture",
      ci.includes("node tests/workspace-agent-app-shell-browser.mjs"))
  ];
  const nodeHasIdentity=/["']\/api\/agentic\/workspace-identity["']/.test(n);
  const nodeHasTasks=/["']\/api\/agentic\/workspace-tasks["']/.test(n);
  const sourceFingerprint=createHash("sha256").update(
    Object.keys(FILES).sort().map(key=>key+"\0"+String(sources?.[key]||"")).join("\n")
  ).digest("hex");
  const safetyChecksPassed=checks.every(check=>check.passed);
  return {
    schema:"thebe.workspace-agent.offline-qualification.v1",
    sourceSha256:sourceFingerprint,
    safetyChecksPassed,
    checks,
    nodeTransport:{
      identityRoutePresent:nodeHasIdentity,
      tasksRoutePresent:nodeHasTasks,
      privateTestCandidatePresent:privateNode.includes("export function registerPrivateNodeWorkspaceAgent"),
      parityQualified:false
    },
    blockers:[
      ...((!nodeHasIdentity||!nodeHasTasks)?["node_workspace_agent_identity_task_transport_missing"]:["node_workspace_agent_transport_unqualified"]),
      "isolated_staging_resource_session_and_binding_identity_unverified",
      "real_authenticated_staging_browser_and_tenant_isolation_unverified",
      "protected_staging_review_and_activation_approval_required"
    ],
    readyForStagingDeployment:false,
    productionActivationAuthorized:false,
    result:safetyChecksPassed?"OFFLINE_BASELINE_PASS_NOT_DEPLOYABLE":"OFFLINE_SAFETY_CHECK_FAILED"
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const result=qualifyWorkspaceAgentOffline(readWorkspaceAgentSources());
  const outputIndex=process.argv.indexOf("--output");
  if(outputIndex>=0) {
    const output=process.argv[outputIndex+1];
    if(!output||!output.endsWith(".json"))throw Error("json_output_path_required");
    writeFileSync(output,JSON.stringify(result,null,2)+"\n",{flag:"w",mode:0o600});
  }
  console.log(JSON.stringify(result,null,2));
  if(!result.safetyChecksPassed)process.exitCode=1;
}
