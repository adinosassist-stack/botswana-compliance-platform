import test from "node:test";
import assert from "node:assert/strict";
import { handleWorkspaceAgentTasksRequest } from "../cloudflare/src/workspace-agent-tasks-api.js";

// Real session authentication uses a signed cookie and active DB membership.
// This test deliberately verifies fail-closed behavior without such a session.
const url = "https://thebedesk.com/api/agentic/workspace-tasks";
test("query parameters cannot spoof authenticated tenant or reviewer", async () => {
  const request = new Request(url + "?workspace=finance&tenantId=other&userId=admin&reviewerApproved=true");
  const response = await handleWorkspaceAgentTasksRequest({
    request, env: { DB: { prepare() { throw new Error("DB should not be queried without a session"); } } }
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("the candidate endpoint does not allow mutations", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await handleWorkspaceAgentTasksRequest({ request: new Request(url, { method }), env: {} });
    assert.equal(response.status, 405);
  }
});
