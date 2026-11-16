import agent from "./agentic-entry.js";
import { isWorkspaceAgentAdvisoryPath } from "./workspace-agent-api-staging-gate.js";

const notFound = () => Response.json({ error: "not_found" }, {
  status: 404,
  headers: { "cache-control": "no-store" },
});

// A dedicated qualification entry. Expose only the two advisory handlers to
// the unrouted service caller, even if the underlying Agent adds more routes.
export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (env.APP_ENV !== "staging" || request.method !== "GET" ||
        !isWorkspaceAgentAdvisoryPath(path)) {
      return notFound();
    }
    return agent.fetch(request, env, ctx);
  },
};
