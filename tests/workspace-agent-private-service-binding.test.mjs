import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const host = "workspace-agent-staging.thebedesk.com";
const database = "workspace-agent-synthetic-local";

async function bundle(contents) {
  const [{text}] = (await build({
    stdin: {contents, resolveDir: fileURLToPath(new URL("../cloudflare/src/", import.meta.url))},
    bundle: true, format: "esm", platform: "neutral", external: ["node:*"], write: false,
  })).outputFiles;
  return text;
}

test("private staging caller qualifies two synthetic tenants and removes fixtures", {timeout: 45000}, async () => {
  const secret = randomUUID();
  const [targetScript, callerScript] = await Promise.all([
    bundle('export { default } from "./workspace-agent-staging-qualification-entry.js";'),
    bundle(`
      import caller, {qualifyPrivateWorkspaceAgent} from "./workspace-agent-staging-qualification-caller.js";
      export default {
        async fetch(request, env) {
          try {
            const path = new URL(request.url).pathname;
            if (path === "/schedule") {
              await caller.scheduled({scheduledTime: Number(env.QUALIFICATION_MINUTE_MS) + 6833}, env);
              return new Response(null, {status: 204});
            }
            if (path === "/fail") {
              await qualifyPrivateWorkspaceAgent({...env, TARGET: {fetch: () => new Response(null, {status: 503})}});
            }
            if (path === "/occupied") {
              await env.DB.prepare("CREATE TABLE unrelated (id TEXT)").run();
              await qualifyPrivateWorkspaceAgent(env);
            }
            if (path === "/tables") {
              const {results} = await env.DB.prepare(
                "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name"
              ).all();
              return Response.json(results.map(row => row.name));
            }
            return Response.json(await qualifyPrivateWorkspaceAgent(env));
          } catch (error) {
            return Response.json({error: error.message}, {status: 500});
          }
        },
      };
    `),
  ]);
  const runtime = new Miniflare(convertV4MiniflareOptions({workers: [
    {
      name: "caller", modules: true, script: callerScript, serviceBindings: {TARGET: "target"},
      d1Databases: {DB: database}, bindings: {SESSION_SECRET: secret, QUALIFICATION_MINUTE_MS: "1794695100000"},
    },
    {
      name: "target", modules: true, script: targetScript, compatibilityDate: "2026-09-03",
      compatibilityFlags: ["nodejs_compat"], d1Databases: {DB: database},
      bindings: {
        SESSION_SECRET: secret, APP_ENV: "staging",
        WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED: "true", WORKSPACE_AGENT_ADVISORY_STAGING_HOST: host,
      },
    },
  ]}));
  const dispatch = path => runtime.dispatchFetch("http://localhost" + path);
  const tables = async () => (await dispatch("/tables")).json();
  try {
    const response = await dispatch("/qualify");
    const receipt = await response.json();
    assert.equal(response.status, 200, JSON.stringify(receipt));
    assert.deepEqual(receipt, {
      results: [
        {case: "owner-a", status: 200}, {case: "manager-a", status: 200}, {case: "owner-b", status: 200},
        {case: "viewer", status: 403}, {case: "expired", status: 401}, {case: "revoked", status: 401},
        {case: "no-session", status: 401},
      ],
      mutationDenied: true, unrelatedPathDenied: true,
    });
    assert.deepEqual(await tables(), []);

    const scheduled = await dispatch("/schedule");
    assert.equal(scheduled.status, 204, await scheduled.text());
    assert.deepEqual(await tables(), []);

    const failure = await dispatch("/fail");
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), {error: "owner-a_status"});
    assert.deepEqual(await tables(), []);

    const occupied = await dispatch("/occupied");
    assert.equal(occupied.status, 500);
    assert.deepEqual(await occupied.json(), {error: "qualification_database_not_empty"});
    assert.deepEqual(await tables(), ["unrelated"]);
  } finally {
    await runtime.dispose();
  }
});
