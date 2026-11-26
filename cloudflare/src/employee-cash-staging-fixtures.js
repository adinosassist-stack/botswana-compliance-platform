import { runEmployeeCashStagingAcceptance } from "./employee-cash-staging-acceptance.js";

const database = "adfa3871-5ecf-4672-8d2f-be9b142d5fc1";

function account(prefix, tenantId) {
  const id = crypto.randomUUID();
  return { id, tenantId, email: `${prefix}-${id}@example.test`, password: crypto.randomUUID() + crypto.randomUUID() };
}

async function passwordHash(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  const encode = bytes => btoa(String.fromCharCode(...bytes));
  return `pbkdf2$100000$${encode(salt)}$${encode(new Uint8Array(bits))}`;
}

export async function runWithEmployeeCashFixtures(env) {
  if (env.APP_ENV !== "staging" || env.STAFF_STAGING_D1_ID !== database ||
      !env.DB || !env.EMPLOYEE_CASH_STAGING) throw Error("Private acceptance bindings required");

  const db = env.DB;
  const identity = await db.prepare(
    "SELECT database_id, environment FROM employee_self_service_staging_identity WHERE id = 1",
  ).first();
  if (identity?.database_id !== database || identity.environment !== "employee-self-service-isolated") {
    throw Error("Isolated staging database required");
  }

  const tenantId = crypto.randomUUID();
  const otherTenantId = crypto.randomUUID();
  const manager = account("manager", tenantId);
  const otherManager = account("manager", otherTenantId);
  const employee = account("employee", tenantId);
  const managers = [manager, otherManager];
  const hashes = await Promise.all(managers.map(item => passwordHash(item.password)));
  const bound = (sql, ...values) => db.prepare(sql).bind(...values);

  await db.batch([
    bound("INSERT INTO tenants(id, name) VALUES (?, ?), (?, ?)", tenantId, "Synthetic Employee Cash A", otherTenantId, "Synthetic Employee Cash B"),
    ...managers.flatMap((item, index) => [
      bound("INSERT INTO users(id, email, display_name, password_hash) VALUES (?, ?, ?, ?)", item.id, item.email, "Synthetic Manager", hashes[index]),
      bound("INSERT INTO memberships(user_id, tenant_id, role, status) VALUES (?, ?, 'manager', 'active')", item.id, item.tenantId),
    ]),
    bound("INSERT INTO employees(id, tenant_id, full_name, status) VALUES (?, ?, ?, 'active')", employee.id, tenantId, "Synthetic Employee"),
  ]);

  try {
    return await runEmployeeCashStagingAcceptance(env.EMPLOYEE_CASH_STAGING, {
      manager, otherManager, employee, date: new Date().toISOString().slice(0, 10),
    });
  } finally {
    await db.batch([
      bound("DELETE FROM employee_cash_events WHERE tenant_id = ? AND employee_id = ?", tenantId, employee.id),
      bound("DELETE FROM employee_cash_entries WHERE tenant_id = ? AND employee_id = ?", tenantId, employee.id),
      bound("DELETE FROM employee_cash_counts WHERE tenant_id = ? AND employee_id = ?", tenantId, employee.id),
      bound("DELETE FROM employee_portal_sessions WHERE account_id IN (SELECT id FROM employee_portal_accounts WHERE tenant_id = ? AND employee_id = ?)", tenantId, employee.id),
      bound("DELETE FROM employee_portal_accounts WHERE tenant_id = ? AND employee_id = ?", tenantId, employee.id),
      bound("DELETE FROM employee_portal_invites WHERE tenant_id = ? AND employee_id = ?", tenantId, employee.id),
      bound("DELETE FROM employees WHERE id = ? AND tenant_id = ?", employee.id, tenantId),
      bound("DELETE FROM sessions WHERE (tenant_id = ? AND user_id = ?) OR (tenant_id = ? AND user_id = ?)", tenantId, manager.id, otherTenantId, otherManager.id),
      bound("DELETE FROM memberships WHERE (tenant_id = ? AND user_id = ?) OR (tenant_id = ? AND user_id = ?)", tenantId, manager.id, otherTenantId, otherManager.id),
      bound("DELETE FROM users WHERE id IN (?, ?)", manager.id, otherManager.id),
      bound("DELETE FROM tenants WHERE id IN (?, ?)", tenantId, otherTenantId),
    ]);
  }
}
