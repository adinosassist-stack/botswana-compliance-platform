const fixtureTables = ["sessions", "memberships", "agent_responsibilities", "users"];
const tenants = [
  { id: "synthetic-a", objective: "Synthetic alpha objective" },
  { id: "synthetic-b", objective: "Synthetic beta objective" },
];
const cases = [
  { id: "owner-a", tenant: 0, role: "owner", status: 200 },
  { id: "manager-a", tenant: 0, role: "manager", status: 200 },
  { id: "owner-b", tenant: 1, role: "owner", status: 200 },
  { id: "viewer", tenant: 0, role: "viewer", status: 403 },
  { id: "expired", tenant: 0, role: "owner", status: 401 },
  { id: "revoked", tenant: 0, role: "owner", status: 401 },
];
const origin = "https://workspace-agent-staging.thebedesk.com";

function check(condition, code) {
  if (!condition) throw new Error(code);
}

async function emptyDatabase(db) {
  const {results} = await db.prepare(
    "SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'",
  ).all();
  return Array.isArray(results) && results.length === 0;
}

async function fixtureSessions(secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  return Promise.all(cases.map(async scenario => {
    const token = crypto.randomUUID();
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(token));
    const hash = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
    return {...scenario, token, hash};
  }));
}

async function snapshot(db) {
  const tables = await db.batch([
    db.prepare("SELECT * FROM users ORDER BY id"),
    db.prepare("SELECT * FROM memberships ORDER BY user_id, tenant_id"),
    db.prepare("SELECT * FROM sessions ORDER BY user_id, tenant_id"),
    db.prepare("SELECT * FROM agent_responsibilities ORDER BY id"),
  ]);
  check(tables.every(table => table.success && Array.isArray(table.results)), "fixture_snapshot_failed");
  return JSON.stringify(tables.map(table => table.results));
}

export async function qualifyPrivateWorkspaceAgent({DB: db, TARGET: target, SESSION_SECRET: secret}) {
  check(typeof secret === "string" && secret.length >= 32, "synthetic_session_secret_required");
  check(await emptyDatabase(db), "qualification_database_not_empty");
  const sessions = await fixtureSessions(secret);
  const fixtureResults = await db.batch([
    db.prepare("CREATE TABLE users(id TEXT, email TEXT, session_generation INTEGER)"),
    db.prepare("CREATE TABLE memberships(tenant_id TEXT, user_id TEXT, role TEXT, status TEXT)"),
    db.prepare("CREATE TABLE sessions(token_hash TEXT, user_id TEXT, tenant_id TEXT, csrf_token TEXT, session_generation INTEGER, expires_at TEXT)"),
    db.prepare("CREATE TABLE agent_responsibilities(id TEXT, tenant_id TEXT, objective TEXT, workspace TEXT, status TEXT, updated_at TEXT)"),
    ...tenants.map(({id, objective}) => db.prepare(
      "INSERT INTO agent_responsibilities VALUES (?, ?, ?, 'owner', 'active', CURRENT_TIMESTAMP)",
    ).bind(id, id, objective)),
    ...sessions.flatMap(({id, tenant, role, hash}) => [
      db.prepare("INSERT INTO users VALUES (?, ?, ?)").bind(id, id + "@example.invalid", id === "revoked" ? 1 : 0),
      db.prepare("INSERT INTO memberships VALUES (?, ?, ?, 'active')").bind(tenants[tenant].id, id, role),
      db.prepare("INSERT INTO sessions VALUES (?, ?, ?, 'synthetic', 0, ?)").bind(
        hash, id, tenants[tenant].id, id === "expired" ? "2000-01-01" : "2099-01-01",
      ),
    ]),
  ]);
  try {
    check(fixtureResults.every(result => result.success), "fixture_setup_failed");
    const before = await snapshot(db);
    const results = [];
    const request = (path, token, method = "GET") => target.fetch(new Request(origin + path, {
      method, headers: token ? {cookie: "__Host-bw_session=" + token} : {},
    }));
    for (const scenario of [...sessions, {id: "no-session", status: 401}]) {
      const identity = await request("/api/agentic/workspace-identity", scenario.token);
      const tasks = await request("/api/agentic/workspace-tasks?workspace=owner", scenario.token);
      check(identity.status === scenario.status && tasks.status === scenario.status, scenario.id + "_status");
      check([identity, tasks].every(response => response.headers.get("cache-control") === "no-store"),
        scenario.id + "_cache");
      const user = await identity.json();
      const body = await tasks.json();
      if (scenario.status === 200) {
        const tenant = tenants[scenario.tenant];
        check(user.ok && user.tenantId === tenant.id && user.userId === scenario.id, scenario.id + "_identity");
        const payload = JSON.stringify(body);
        check(payload.includes(tenant.objective) && !payload.includes(tenants[1 - scenario.tenant].objective),
          scenario.id + "_tenant_scope");
      } else {
        const denied = scenario.status === 401 ? "unauthenticated" : "forbidden";
        check([user, body].every(value => value.error === denied && Object.keys(value).length === 1),
          scenario.id + "_denial");
      }
      results.push({case: scenario.id, status: scenario.status});
    }
    check((await request("/api/agentic/workspace-tasks", sessions[0].token, "POST")).status === 404, "mutation_not_denied");
    check((await request("/api/version")).status === 404, "unrelated_path_not_denied");
    check(await snapshot(db) === before, "advisory_requests_changed_fixtures");
    return {results, mutationDenied: true, unrelatedPathDenied: true};
  } finally {
    // Setup is one transactional D1 batch. Run cleanup only after that batch
    // returned, so a second invocation that failed setup cannot drop fixtures.
    const cleanup = await db.batch(fixtureTables.map(name => db.prepare("DROP TABLE " + name)));
    check(cleanup.every(result => result.success) && await emptyDatabase(db), "fixture_cleanup_failed");
  }
}

export default {
  async scheduled(event, env) {
    const minute = Number(env.QUALIFICATION_MINUTE_MS);
    if (!Number.isSafeInteger(minute) || minute <= 0 || minute % 60000 !== 0 ||
        !(event.scheduledTime >= minute && event.scheduledTime < minute + 60000)) return;
    const receipt = await qualifyPrivateWorkspaceAgent(env);
    console.log(JSON.stringify({event: "workspace_agent_qualification", ...receipt, fixturesRemoved: true}));
  },
};
