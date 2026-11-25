// Run from a protected runner after seeding isolated, short-lived synthetic sessions.
// Supply CONVERSATION_HOSTED_ACCEPTANCE as JSON with clientId, clientSecret and
// sessions (two for the first synthetic user, one for a different tenant).
// Each session must contain token and csrf. Purge the fixtures and revoke the
// Access credential after the run, including when a check fails.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const origin = "https://conversation-staging.thebedesk.com";
const root = "/api/conversation-staging/threads";
const headerSafe = value => typeof value === "string" && /^[A-Za-z0-9_.@-]{16,256}$/.test(value);
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

function readConfig(raw) {
  const config = JSON.parse(raw ?? "null");
  if (!headerSafe(config?.clientId) || !headerSafe(config?.clientSecret) ||
      !Array.isArray(config.sessions) || config.sessions.length !== 3 ||
      !config.sessions.every(session => headerSafe(session?.token) && headerSafe(session?.csrf)) ||
      new Set(config.sessions.map(session => session.token)).size !== 3) {
    throw new Error("Expected temporary Access credentials and three distinct synthetic sessions");
  }
  return config;
}

function request(config, label, status, path = root, { session, method = "GET", badCsrf = false, body } = {}) {
  const headers = {
    "CF-Access-Client-Id": config.clientId,
    "CF-Access-Client-Secret": config.clientSecret
  };
  if (session) {
    headers.Cookie = "__Host-bw_session=" + session.token;
    if (method !== "GET") {
      headers.Origin = origin;
      headers["x-csrf-token"] = badCsrf ? "invalid" : session.csrf;
    }
  }
  if (body) headers["content-type"] = "application/json";
  if (body?.exchange) headers["x-thebe-conversation-exchange"] = "1";

  // Keep credentials out of curl arguments and never follow redirects.
  const curlConfig = Object.entries(headers).map(([name, value]) =>
    "header = " + JSON.stringify(name + ": " + value));
  if (body) curlConfig.push("data-binary = " + JSON.stringify(JSON.stringify(body)));
  const result = spawnSync("curl", [
    "--disable", "--config", "-", "--silent", "--max-time", "20",
    "--request", method, "--write-out", "\n%{http_code}", origin + path
  ], {
    input: curlConfig.join("\n"), encoding: "utf8", maxBuffer: 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "CONVERSATION_HOSTED_ACCEPTANCE"))
  });
  const actual = Number(result.stdout?.slice(-3));
  if (result.status !== 0 || actual !== status) {
    throw new Error(label + " expected HTTP " + status + ", received " + (actual || "no response"));
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout.slice(0, -3));
  } catch {
    throw new Error(label + " returned invalid JSON");
  }
  console.log(label + " HTTP " + actual);
  return payload;
}

function verify(condition, message) {
  if (!condition) throw new Error(message);
}

function run(config) {
  const [owner, second, other] = config.sessions;
  const send = (label, status, ...args) => request(config, label, status, ...args);
  const title = "Synthetic hosted acceptance " + randomUUID();
  verify(send("Require Thebe session", 401).error === "unauthenticated", "Expected Thebe session denial");
  verify(send("Reject invalid CSRF", 403, root, { session: owner, method: "POST", badCsrf: true }).error === "csrf_required", "Expected Thebe CSRF denial");
  verify(send("Reject mutation payload", 400, root, { session: owner, method: "POST", body: {} }).error === "body_not_supported", "Expected request body denial");
  const { id } = send("Create thread", 201, root, { session: owner, method: "POST" });
  verify(typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id), "Unexpected thread ID");
  const thread = root + "?" + new URLSearchParams({ threadId: id });
  const messages = root + "/" + id + "/messages";
  const body = { exchange: { question: "Synthetic question", answer: "Synthetic answer", idempotencyKey: randomUUID() } };
  send("Write exchange", 200, messages, { session: owner, method: "POST", body });
  verify(send("Retry exchange", 200, messages, { session: second, method: "POST", body }).duplicate === true, "Expected duplicate exchange marker");
  verify(same(send("Restore second session", 200, messages, { session: second }).items?.map(item => item.content_redacted),
    ["Synthetic answer", "Synthetic question"]), "Restored exchange differs");
  send("Block cross-tenant read", 401, messages, { session: other });
  send("Block cross-tenant rename", 404, thread, { session: other, method: "PATCH", body: { title } });
  verify(send("Rename thread", 200, thread, { session: second, method: "PATCH", body: { title } }).title === title, "Renamed thread title differs");
  const search = root + "?" + new URLSearchParams({ q: title });
  verify(same(send("Find renamed thread", 200, search, { session: owner }).items?.map(item => item.id), [id]), "Renamed thread missing from search");
  verify(same(send("Isolate search", 200, search, { session: other }).items, []), "Cross-tenant result returned");
  send("Delete thread", 200, thread, { session: second, method: "DELETE" });
  verify(same(send("Keep deleted thread out of search", 200, search, { session: owner }).items, []), "Deleted thread returned in search");
  send("Keep deleted messages inaccessible", 401, messages, { session: owner });
}

let config;
try {
  config = readConfig(process.env.CONVERSATION_HOSTED_ACCEPTANCE);
} catch {
  console.error("Invalid CONVERSATION_HOSTED_ACCEPTANCE configuration");
  process.exit(1);
}
try {
  run(config);
  console.log("Hosted conversation API acceptance passed");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
