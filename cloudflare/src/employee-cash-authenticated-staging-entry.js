import { pbkdf2 } from "node:crypto";
import app, {
  authenticateWorkspaceSession,
  __v782179Test,
  __v782178Test,
  __v782195Test,
} from "./worker.js";
import { handleStaffManager, handleStaffPublic } from "./employee-self-service.js";

const { edgeScopedRateLimit } = __v782178Test;
const { readJson } = __v782179Test;
const { requestOriginAllowed } = __v782195Test;

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

function csrfMatches(request, session) {
  const expected = session.csrf_token;
  const supplied = request.headers.get("x-csrf-token");
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
}

async function handleSyntheticManager(request, url, env) {
  try {
    const auth = await authenticateWorkspaceSession(request, env);
    if (!auth) return error("unauthenticated", 401);
    if (auth.role !== "manager" || !auth.email?.endsWith("@example.test")) {
      return error("forbidden", 403);
    }
    if (!requestOriginAllowed(request, env)) return error("origin_failed", 403);
    if (request.method !== "GET" && !csrfMatches(request, auth)) {
      return error("csrf_failed", 403);
    }
    return await handleStaffManager({
      request, url, env, auth, readJson,
      id: () => crypto.randomUUID(),
      json: (body, status = 200) => Response.json(body, {
        status, headers: { "cache-control": "no-store" },
      }),
    }) ?? error("not_found", 404);
  } catch {
    return error("employee_cash_staging_manager_unavailable", 503);
  }
}

class StaffPasswordDerivationError extends Error {}

function derivePassword(password, salt, iterations) {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, 32, "sha256", (error, digest) => {
      if (error) reject(new StaffPasswordDerivationError());
      else resolve(digest);
    });
  });
}

async function handleSyntheticStaffAuth(request, url, env) {
  const json = (body, status = 200, headers = {}) => Response.json(body, {
    status, headers: { ...headers, "cache-control": "no-store" },
  });
  try {
    return await handleStaffPublic({
      request, url, env, json, readJson, requestOriginAllowed, edgeScopedRateLimit, derivePassword,
      rateLimitResponse: result => json({ error: "rate_limited" }, 429, {
        "retry-after": String(result.retryAfterSeconds || 60),
      }),
      id: () => crypto.randomUUID(),
    }) ?? error("not_found", 404);
  } catch (failure) {
    return error(failure instanceof StaffPasswordDerivationError
      ? "employee_cash_staging_password_derivation_failed"
      : "employee_cash_staging_staff_auth_failed", 503);
  }
}

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

      if (url.pathname.startsWith("/api/employee-self-service/")) {
        return handleSyntheticManager(request, url, env);
      }
      if (url.pathname === "/public/employee/accept" || url.pathname === "/public/employee/login") {
        return handleSyntheticStaffAuth(request, url, env);
      }
      return application.fetch(request, env, ctx);
    },
  };
}

export default createEmployeeCashStagingEntry();
