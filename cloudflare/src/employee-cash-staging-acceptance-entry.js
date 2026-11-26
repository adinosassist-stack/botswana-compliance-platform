import { WorkflowEntrypoint } from "cloudflare:workers";
import { runWithEmployeeCashFixtures } from "./employee-cash-staging-fixtures.js";

export class EmployeeCashAcceptance extends WorkflowEntrypoint {
  async run(_event, step) {
    return step.do("Verify isolated Employee Cash", { retries: { limit: 0, delay: "1 second" }, timeout: "2 minutes" }, async () => {
      try {
        return await runWithEmployeeCashFixtures(this.env);
      } catch (error) {
        const message = error?.message ?? "";
        const safe = /^Employee Cash staging check failed: [\w /\-[\]]{1,140}$/.test(message);
        throw new Error(safe ? message : "Employee Cash staging acceptance or cleanup failed");
      }
    });
  }
}

export default {};
