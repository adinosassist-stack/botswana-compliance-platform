import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const runtime = readFileSync(new URL("../public/js/workspace-runtime-20261001b.js", import.meta.url), "utf8");
test("existing authenticated shell provides ready and navigation events", () => {
  assert.match(runtime, /thebe:workspace-ready/);
  assert.match(runtime, /thebe:workspace-view-change/);
  assert.match(runtime, /function showView\(id,options=\{\}\)/);
  assert.match(runtime, /async function logoutUser\(\)/);
});
test("existing runtime remains canonical without injected Agent event hooks", () => {
  assert.doesNotMatch(runtime, /thebe:workspace-agent-shell-state/);
  assert.doesNotMatch(runtime, /emitWorkspaceAgentShellState/);
});
