import app from "./worker.js";

const profile = "employee-cash-authenticated-staging";
const database = "adfa3871-5ecf-4672-8d2f-be9b142d5fc1";
const origin = "https://employee-cash-staging.internal";

const allowed = new Set([
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "GET /api/auth/me",
  "POST /public/employee/accept",
  "POST /public/employee/login",
  "POST /public/employee/logout",
  "GET /public/employee/me",
  "GET /public/employee/cash",
  "POST /public/employee/cash/expenses",
  "POST /public/employee/cash/counts",
  "POST /api/employee-self-service/invitations",
  "GET /api/employee-self-service/cash",
  "POST /api/employee-self-service/cash/advances",
]);
const review = /^\/api\/employee-self-service\/cash\/(entries|counts)\/[a-f0-9-]{36}\/review$/i;

const error = (code, status) => Response.json({ error: code }, {
  status,
  headers: { "cache-control": "no-store" },
});

export function createEmployeeCashStagingEntry(application = app) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.origin !== origin ||
          !(allowed.has(`${request.method} ${url.pathname}`) ||
            (request.method === "POST" && review.test(url.pathname)))) {
        return error("not_found", 404);
      }
      if (env.APP_ENV !== "staging" ||
          env.DEPLOYMENT_PROFILE !== profile ||
          env.STAFF_STAGING_D1_ID !== database ||
          !/^[a-f0-9]{40}$/.test(env.STAFF_STAGING_SOURCE_SHA ?? "") ||
          env.PUBLIC_ORIGIN !== origin || env.PUBLIC_APP_URL !== origin ||
          env.THEBE_STAFF_PORTAL_ENABLED !== "true" ||
          env.THEBE_EMPLOYEE_CASH_ENABLED !== "true" ||
          !env.DB || !env.SESSION_SECRET || !env.PUBLIC_RATE_LIMITER) {
        return error("employee_cash_staging_unqualified", 503);
      }

      try {
        const identity = await env.DB.prepare(
          "SELECT database_id, environment FROM employee_self_service_staging_identity WHERE id = 1",
        ).first();
        if (identity?.database_id !== database ||
            identity.environment !== "employee-self-service-isolated") {
          return error("employee_cash_staging_database_unqualified", 503);
        }
      } catch {
        return error("employee_cash_staging_database_unqualified", 503);
      }

      return application.fetch(request, env, ctx);
    },
  };
}

export default createEmployeeCashStagingEntry();
