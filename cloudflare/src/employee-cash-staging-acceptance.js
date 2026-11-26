const origin = "https://employee-cash-staging.internal";
const managerCash = "/api/employee-self-service/cash";
const staffCash = "/public/employee/cash";
const uuid = /^[0-9a-f-]{36}$/i;

function requireCheck(condition, step) {
  if (!condition) throw new Error(`Employee Cash staging check failed: ${step}`);
}

// Call through a private Worker service binding. All fixture identities must use
// synthetic records and fresh employee IDs provisioned for this acceptance run.
export async function runEmployeeCashStagingAcceptance(service, fixture) {
  const { manager, otherManager, employee, date } = fixture;
  for (const account of [manager, otherManager, employee]) {
    requireCheck(account.email?.endsWith("@example.test") && uuid.test(account.tenantId), "synthetic fixture");
    requireCheck(typeof account.password === "string" && account.password.length >= 12, "fixture password");
  }
  requireCheck(manager.tenantId === employee.tenantId &&
    manager.tenantId !== otherManager.tenantId && uuid.test(employee.id), "fixture isolation");
  requireCheck(/^\d{4}-\d{2}-\d{2}$/.test(date), "fixture report date");

  async function call(method, path, status, session, payload) {
    const headers = new Headers({ origin, accept: "application/json" });
    if (session) {
      headers.set("cookie", session.cookie);
      headers.set(session.csrfHeader, session.csrf);
    }
    if (payload) headers.set("content-type", "application/json");
    const route = `${method} ${path.replace(uuidInPath, "[id]")}`;
    let response;
    try {
      response = await service.fetch(new Request(origin + path, {
        method, headers, body: payload ? JSON.stringify(payload) : undefined,
      }));
    } catch {
      throw new Error(`Employee Cash staging check failed: ${route} service request`);
    }
    requireCheck(response.status === status, `${route} HTTP ${response.status}`);
    try {
      return { body: await response.json(), headers: response.headers };
    } catch {
      throw new Error(`Employee Cash staging check failed: ${route} invalid JSON`);
    }
  }

  async function signIn(path, account, cookieName) {
    const { body, headers } = await call("POST", path, 200, null, {
      email: account.email, password: account.password, tenantId: account.tenantId,
    });
    const cookie = headers.get("set-cookie")?.split(";")[0];
    requireCheck(cookie?.startsWith(cookieName + "=") && body.csrfToken, "session and CSRF");
    if (cookieName === "__Host-bw_session") {
      requireCheck(body.user?.role === "manager" && body.user.tenantId === account.tenantId, "manager role");
    }
    return { cookie, csrf: body.csrfToken, csrfHeader: cookieName === "__Host-thebe_staff_session" ? "x-staff-csrf" : "x-csrf-token" };
  }

  const managerSession = await signIn("/api/auth/login", manager, "__Host-bw_session");
  const otherSession = await signIn("/api/auth/login", otherManager, "__Host-bw_session");
  const invitation = await call("POST", "/api/employee-self-service/invitations", 201, managerSession, {
    employeeId: employee.id, email: employee.email,
  });
  requireCheck(typeof invitation.body.link === "string" && URL.canParse(invitation.body.link), "synthetic invitation URL");
  const link = new URL(invitation.body.link);
  const token = new URLSearchParams(link.hash.slice(1)).get("invite");
  requireCheck(link.origin === origin && /^[a-f0-9]{64}$/.test(token ?? ""), "synthetic invitation");
  await call("POST", "/public/employee/accept", 200, null, { token, password: employee.password });
  const staffSession = await signIn("/public/employee/login", employee, "__Host-thebe_staff_session");
  const me = await call("GET", "/public/employee/me", 200, staffSession);
  requireCheck(me.body.employee?.id === employee.id && me.body.tenantId === employee.tenantId, "employee identity");

  const requestKey = crypto.randomUUID();
  const advance = await call("POST", managerCash + "/advances", 201, managerSession, {
    employeeId: employee.id, amountMinor: 10000, occurredOn: date, purpose: "Synthetic cash advance", requestKey,
  });
  requireCheck(advance.body.postedToFinance === false, "advance ledger isolation");
  const expensePayload = {
    amountMinor: 2000, occurredOn: date, purpose: "Synthetic fuel expense", category: "fuel", requestKey: crypto.randomUUID(),
  };
  await call("POST", staffCash + "/expenses", 403, { ...staffSession, csrf: "invalid" }, expensePayload);
  const expense = await call("POST", staffCash + "/expenses", 201, staffSession, expensePayload);
  const replay = await call("POST", staffCash + "/expenses", 200, staffSession, expensePayload);
  requireCheck(uuid.test(expense.body.id) && replay.body.id === expense.body.id && replay.body.replayed === true &&
    expense.body.postedToFinance === false, "expense idempotency and ledger isolation");

  const count = await call("POST", staffCash + "/counts", 201, staffSession, { countedMinor: 8000, reportDate: date });
  requireCheck(uuid.test(count.body.id), "cash count identity");
  const expensePath = managerCash + "/entries/" + expense.body.id + "/review";
  const rejected = await call("POST", expensePath, 409, otherSession, { decision: "approve" });
  requireCheck(rejected.body.error === "cash_review_unavailable_or_already_reviewed", "cross-tenant review denial");
  await call("POST", expensePath, 200, managerSession, { decision: "approve" });
  await call("POST", managerCash + "/counts/" + count.body.id + "/review", 200, managerSession, { decision: "approve" });

  const view = await call("GET", managerCash, 200, managerSession);
  const otherView = await call("GET", managerCash, 200, otherSession);
  requireCheck(view.body.entries.some(row => row.id === expense.body.id && row.status === "approved") &&
    view.body.counts.some(row => row.id === count.body.id && row.status === "approved") &&
    view.body.financePosted === false, "manager reconciliation view");
  requireCheck(!otherView.body.entries.some(row => row.id === expense.body.id) &&
    !otherView.body.counts.some(row => row.id === count.body.id), "cross-tenant read isolation");

  await call("POST", "/public/employee/logout", 200, staffSession);
  await call("POST", "/api/auth/logout", 200, managerSession);
  await call("POST", "/api/auth/logout", 200, otherSession);
  return { result: "PASS", employeeSession: true, managerSession: true, cashFlow: true, tenantIsolation: true };
}

const uuidInPath = /\/[0-9a-f-]{36}(?=\/)/gi;
