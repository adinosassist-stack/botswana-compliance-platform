import assert from "node:assert/strict";
import test from "node:test";
import {relayStagingDockResearch} from "../cloudflare/src/general-ai-dock-staging-relay.js";

const origin = "https://workspace-staging.thebedesk.com";
const token = "a".repeat(64);
const csrf = "b".repeat(64);
const question = "Search the live web for Botswana’s official 2022 census population.";
const makeRequest = (overrides = {}, suffix = "") => new Request(origin + "/api/ai/general" + suffix, {
  method: "POST",
  headers: {
    origin,
    "content-type": "application/json",
    cookie: "__Host-bw_session=" + token + "; unrelated=omit",
    "x-csrf-token": csrf,
    authorization: "Bearer omit",
    ...overrides
  },
  body: JSON.stringify({question})
});
const settings = {
  environment: "staging",
  enabled: true,
  workspaceOrigin: origin,
  authorizeSyntheticSession: async session => session.token === token && session.csrf === csrf
};

test("staging relay rejects ineligible traffic before contacting the binding", async () => {
  let calls = 0;
  const service = {fetch: async () => { calls++; return Response.json({ok: true}); }};
  const cases = [
    [makeRequest(), {environment: "production"}, 404],
    [makeRequest(), {enabled: false}, 404],
    [makeRequest({}, "?upstream=other"), {}, 404],
    [makeRequest({origin: "https://thebedesk.com"}), {}, 403],
    [makeRequest({cookie: ""}), {}, 401],
    [makeRequest({cookie: "__Host-bw_session=" + token + "; __Host-bw_session=" + token}), {}, 401],
    [makeRequest({"x-csrf-token": "c".repeat(64)}), {}, 403],
    [makeRequest(), {service: null}, 503]
  ];
  for (const [request, overrides, status] of cases) {
    const response = await relayStagingDockResearch(request, {...settings, service, ...overrides});
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
});

test("authorized staging request uses the fixed backend and only required headers", async () => {
  const service = {async fetch(request) {
    assert.equal(request.url, "https://ai-staging.thebedesk.com/api/ai/general");
    assert.equal(request.headers.get("origin"), "https://ai-staging.thebedesk.com");
    assert.equal(request.headers.get("cookie"), "__Host-bw_session=" + token);
    assert.equal(request.headers.get("x-csrf-token"), csrf);
    assert.equal(request.headers.has("authorization"), false);
    assert.deepEqual(await request.json(), {question});
    return Response.json({ok: true}, {headers: {"set-cookie": "omit=value"}});
  }};
  const response = await relayStagingDockResearch(makeRequest(), {...settings, service});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.deepEqual(await response.json(), {ok: true});
});

test("private backend redirect fails closed", async () => {
  const service = {fetch: async () => Response.redirect("https://example.org")};
  const response = await relayStagingDockResearch(makeRequest(), {...settings, service});
  assert.equal(response.status, 502);
  assert.equal(response.headers.has("location"), false);
});
