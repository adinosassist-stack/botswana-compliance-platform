# Workspace Agent identity and tasks API — staging-only ingress gate

**Scope:** code-only default-deny control. No deployment, production activation, Cloudflare config changes, DNS, Access policy or D1/PostgreSQL writes.

## Finding and resolution

The Agent /app advisory panel injection is already restricted to approved private staging. However, the Cloudflare `agentic-entry.js` runtime previously called `handleWorkspaceAgentTasksRequest` for both `/api/agentic/workspace-identity` and `/api/agentic/workspace-tasks` **without** that staging-only ingress restriction. Those handlers performed their own signed-cookie/active-membership and owner/manager checks, and used tenant-scoped SELECT, but read-only routes could still be directly requested by authenticated production sessions regardless of the disabled UI preview.

The protected runtime entry now refuses both direct API routes with `404 not_found` **before reaching the handler** unless all of the following are satisfied:

1. `APP_ENV=staging` exactly and `WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED=true` exactly.
2. The HTTP request is GET and the actual URL pathname equals one of the two permitted API paths; logical-path tunneling via `/__thebe_api/` or `__thebe_api_path` does not activate the API.
3. The request uses HTTPS, no URL credentials or explicit nondefault port, and a legitimate `.thebedesk.com` subdomain other than `www`.
4. `WORKSPACE_AGENT_ADVISORY_STAGING_HOST` is explicitly configured and exactly matches that request hostname.

This is an **ingress** policy, not proof of session authorization. The existing task handler independently authenticates signed cookies, active membership, owner/manager role and tenant-scoped database SELECT. Neither a flag, hostname nor browser event grants identity or task execution permission.

Tests independently check production denial even with the flag enabled, missing flags/host, mismatched host, workers.dev, non-HTTPS requests, logical-path tunneling, non-GET methods and foreign routes. The offline readiness qualification fingerprints both the new gate and its placement before the runtime task handler. Any disabled rule fails the offline safety check. `readyForStagingDeployment` remains false.

## Release blocker unchanged

Issue #2433 still has no approved ingress policy or qualified Cloudflare Access application. The existing Stage-A no-route Worker remains inert. The new API gate is source-only; it creates no staging hostname, routes, or Access config and **cannot authorize the browser feature by itself**. A later isolated staging activation must be separately approved by the owner and independent `thusico`, with exact-main proof, synthetic identity resources and network denial tests. Production Agent APIs should remain unreachable after the reviewed code is released; deploying any code is a separate, explicit release action.
