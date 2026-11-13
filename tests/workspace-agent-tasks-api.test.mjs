import test from "node:test";
import assert from "node:assert/strict";
import { handleWorkspaceAgentTasksRequest } from "../cloudflare/src/workspace-agent-tasks-api.js";

const url = "https://thebedesk.com/api/agentic/workspace-tasks?workspace=finance";
const req = (method = "GET", address = url) => new Request(address, { method });
test("workspace task API rejects non-GET methods without reading data", async () => {
  const response = await handleWorkspaceAgentTasksRequest({ request: req("POST"), env: {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("workspace task API rejects missing authenticated session", async () => {
  const response = await handleWorkspaceAgentTasksRequest({ request: req(), env: {} });
  assert.equal(response.status, 401);
});
test("workspace task API does not claim unrelated routes", async () => {
  const response = await handleWorkspaceAgentTasksRequest({
    request: req("GET", "https://thebedesk.com/api/unrelated"), env: {}
  });
  assert.equal(response, null);
});

test("task source candidate window is bounded and exceeds six display slots", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../cloudflare/src/workspace-agent-tasks-api.js", import.meta.url), "utf8");
  const match = source.match(/ORDER BY updated_at DESC LIMIT (\\d+)/);
  assert.ok(match, "task source query must have a fixed SQL limit");
  const limit = Number(match[1]);
  assert.ok(limit > 6 && limit <= 24, "candidate window must allow invalid-row skipping without unbounded reads");
});
