import test from "node:test";
import assert from "node:assert/strict";
import { handleWorkspaceAgentTasksRequest } from "../cloudflare/src/workspace-agent-tasks-api.js";

const req = (method = "GET") => new Request("https://example.test/api/agentic/workspace-identity", { method });

test("workspace identity endpoint is read-only", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await handleWorkspaceAgentTasksRequest({ request: req(method), env: {} });
    assert.equal(response.status, 405);
  }
});
test("workspace identity requires authenticated session", async () => {
  const response = await handleWorkspaceAgentTasksRequest({ request: req(), env: {} });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("workspace identity ignores spoofed query identifiers", async () => {
  const request = new Request("https://example.test/api/agentic/workspace-identity?tenantId=other&userId=other");
  const response = await handleWorkspaceAgentTasksRequest({ request, env: {} });
  assert.equal(response.status, 401);
});
