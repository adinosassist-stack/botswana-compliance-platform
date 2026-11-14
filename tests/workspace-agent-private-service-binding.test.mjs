import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const host = "workspace-agent-staging.thebedesk.com";
const database = "workspace-agent-synthetic-local";
const accountCases = [
  ["ownerA", "A", "owner"],
  ["managerA", "A", "manager"],
  ["ownerB", "B", "owner"],
  ["viewer", "A", "viewer"],
  ["expired", "A", "owner"],
  ["revoked", "A", "owner"],
];

test("private Worker binding authenticates read-only advisory requests against isolated D1", { timeout: 45000 }, async () => {
  const secret = randomUUID();
  const tokens = Object.fromEntries(accountCases.map(([user]) => [user, randomUUID()]));
  const sessions = accountCases.map(([user, tenant, role]) => ({
    user, tenant, role,
    hash: createHmac("sha256", secret).update(tokens[user]).digest("hex"),
    generation: user === "revoked" ? 1 : 0,
    expiry: user === "expired" ? "2000-01-01" : "2099-01-01",
  }));
  const [{ text: targetScript }] = (await build({
    stdin: {
      contents: 'import agent from "./agentic-entry.js"; export default {fetch:agent.fetch};',
      resolveDir: fileURLToPath(new URL("../cloudflare/src/", import.meta.url)),
    },
    bundle: true, format: "esm", platform: "neutral", external: ["node:*"], write: false,
  })).outputFiles;

  const callerScript = `
    export default {
      async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === "/fixtures" && request.method === "POST") {
          const db = env.DB;
          const sessionRows = await request.json();
          await db.batch([
            db.prepare("CREATE TABLE users(id TEXT, email TEXT, session_generation INTEGER)"),
            db.prepare("CREATE TABLE memberships(tenant_id TEXT, user_id TEXT, role TEXT, status TEXT)"),
            db.prepare("CREATE TABLE sessions(token_hash TEXT, user_id TEXT, tenant_id TEXT, csrf_token TEXT, session_generation INTEGER, expires_at TEXT)"),
            db.prepare("CREATE TABLE agent_responsibilities(id TEXT, tenant_id TEXT, objective TEXT, workspace TEXT, status TEXT, updated_at TEXT)"),
            db.prepare("INSERT INTO agent_responsibilities VALUES ('a','A','Synthetic alpha objective','owner','active','2026-11-14'), ('b','B','Synthetic beta objective','owner','active','2026-11-14')"),
            ...sessionRows.flatMap(({user, tenant, role, hash, generation, expiry}) => [
              db.prepare("INSERT INTO users VALUES (?, ?, ?)").bind(user, user + "@example.invalid", generation),
              db.prepare("INSERT INTO memberships VALUES (?, ?, ?, 'active')").bind(tenant, user, role),
              db.prepare("INSERT INTO sessions VALUES (?, ?, ?, 'synthetic', 0, ?)").bind(hash, user, tenant, expiry),
            ]),
          ]);
          return new Response(null, { status: 204 });
        }
        if (url.pathname === "/fixtures") {
          const snapshots = await env.DB.batch([
            env.DB.prepare("SELECT * FROM users ORDER BY id"),
            env.DB.prepare("SELECT * FROM memberships ORDER BY user_id, tenant_id"),
            env.DB.prepare("SELECT * FROM sessions ORDER BY user_id, tenant_id"),
            env.DB.prepare("SELECT * FROM agent_responsibilities ORDER BY id"),
          ]);
          return Response.json(snapshots.map(({results}) => results));
        }
        return env.TARGET.fetch(new Request("https://${host}" + url.pathname + url.search, request));
      },
    };
  `;
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [
    { name: "caller", modules: true, script: callerScript, serviceBindings: { TARGET: "target" }, d1Databases: { DB: database } },
    {
      name: "target", modules: true, script: targetScript, compatibilityDate: "2026-09-03",
      compatibilityFlags: ["nodejs_compat"], d1Databases: { DB: database },
      bindings: {
        SESSION_SECRET: secret, APP_ENV: "staging",
        WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED: "true", WORKSPACE_AGENT_ADVISORY_STAGING_HOST: host,
      },
    },
  ] }));
  const local = "http://localhost";
  const dispatch = (path, user, method = "GET") => runtime.dispatchFetch(
    local + "/api/agentic/workspace-" + path,
    { method, headers: user ? { cookie: "__Host-bw_session=" + tokens[user] } : {} },
  );
  try {
    const setup = await runtime.dispatchFetch(local + "/fixtures", {
      method: "POST", body: JSON.stringify(sessions),
    });
    assert.equal(setup.status, 204, await setup.text());
    const before = await (await runtime.dispatchFetch(local + "/fixtures")).json();
    for (const [user, tenant, expected, other] of [
      ["ownerA", "A", "alpha", "beta"], ["managerA", "A", "alpha", "beta"], ["ownerB", "B", "beta", "alpha"],
    ]) {
      const identity = await dispatch("identity", user);
      assert.equal(identity.status, 200, user);
      assert.deepEqual(await identity.json(), { ok: true, tenantId: tenant, userId: user });
      const tasks = await dispatch("tasks?workspace=owner", user);
      assert.equal(tasks.status, 200, user);
      assert.equal(tasks.headers.get("cache-control"), "no-store");
      const body = JSON.stringify(await tasks.json());
      assert.ok(body.includes("Synthetic " + expected + " objective"), body);
      assert.ok(!body.includes("Synthetic " + other + " objective"), body);
    }
    for (const [user, expected] of [[null, 401], ["expired", 401], ["revoked", 401], ["viewer", 403]]) {
      for (const path of ["identity", "tasks"]) {
        const response = await dispatch(path, user);
        assert.equal(response.status, expected, String(user) + " " + path);
        assert.deepEqual(await response.json(), { error: expected === 403 ? "forbidden" : "unauthenticated" });
      }
    }
    assert.equal((await dispatch("tasks", "ownerA", "POST")).status, 404);
    assert.deepEqual(await (await runtime.dispatchFetch(local + "/fixtures")).json(), before);
  } finally {
    await runtime.dispose();
  }
});
