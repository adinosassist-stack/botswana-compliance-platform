const path = "/api/ai/general";
const backendOrigin = "https://ai-staging.thebedesk.com";
const tokenPattern = /^[a-f0-9]{64}$/;
const deny = status => new Response(null, {status, headers: {"cache-control": "no-store"}});

export async function relayStagingDockResearch(request, {
  environment, enabled, workspaceOrigin, authorizeSyntheticSession, service
} = {}) {
  const url = new URL(request.url);
  if (environment !== "staging" || enabled !== true ||
      !/^https:\/\/[a-z0-9-]+\.thebedesk\.com$/.test(workspaceOrigin) ||
      workspaceOrigin === "https://www.thebedesk.com" ||
      url.origin !== workspaceOrigin || url.pathname !== path || url.search) return deny(404);
  if (request.method !== "POST") return deny(405);
  if (request.headers.get("origin") !== workspaceOrigin) return deny(403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return deny(415);

  const sessions = (request.headers.get("cookie") ?? "").split(";")
    .map(cookie => cookie.trim()).filter(cookie => cookie.startsWith("__Host-bw_session="));
  const token = sessions.length === 1 ? sessions[0].slice("__Host-bw_session=".length) : "";
  const csrf = request.headers.get("x-csrf-token") ?? "";
  if (!tokenPattern.test(token)) return deny(401);
  if (!tokenPattern.test(csrf)) return deny(403);
  if (typeof authorizeSyntheticSession !== "function" || typeof service?.fetch !== "function") return deny(503);

  try {
    if (await authorizeSyntheticSession({token, csrf}) !== true) return deny(403);
    const upstream = await service.fetch(new Request(backendOrigin + path, {
      method: "POST",
      headers: {
        origin: backendOrigin,
        "content-type": "application/json",
        cookie: "__Host-bw_session=" + token,
        "x-csrf-token": csrf
      },
      body: request.body,
      duplex: "half",
      redirect: "error"
    }));
    if (!(upstream instanceof Response) || upstream.status >= 300 && upstream.status < 400) return deny(502);
    return new Response(upstream.body, {status: upstream.status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }});
  } catch {
    return deny(503);
  }
}
