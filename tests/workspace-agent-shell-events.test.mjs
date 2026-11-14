import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const runtime = readFileSync(new URL("../public/js/workspace-runtime-20261001b.js", import.meta.url), "utf8");
test("workspace shell emits scoped lifecycle events", () => {
  assert.match(runtime, /function emitWorkspaceAgentShellState\(reason\)/);
  assert.match(runtime, /thebe:workspace-agent-shell-state/);
  assert.match(runtime, /authenticated:isWorkspaceRole\(role\)/);
  for (const reason of ["ready", "navigation", "logout", "shell-hidden"]) {
    assert.ok(runtime.includes('emitWorkspaceAgentShellState("'+reason+'")'), reason);
  }
});
test("lifecycle event exposes no tenant, user identifier or credential", () => {
  const start = runtime.indexOf("function emitWorkspaceAgentShellState(reason)");
  const end = runtime.indexOf("function markWorkspaceReady()", start);
  const body = runtime.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(body, /tenantId|userId|csrfToken|password|email/);
});
