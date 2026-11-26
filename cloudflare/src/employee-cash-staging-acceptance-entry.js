import { runWithEmployeeCashFixtures } from "./employee-cash-staging-fixtures.js";

export default {
  async scheduled(_controller, env) {
    try {
      const evidence = await runWithEmployeeCashFixtures(env);
      console.log(JSON.stringify(evidence));
    } catch (error) {
      const step = /^Employee Cash staging check failed: [\w /\-[\]]{1,140}$/.test(error?.message)
        ? error.message
        : "Employee Cash staging acceptance or cleanup failed";
      throw new Error(step);
    }
  },
};
