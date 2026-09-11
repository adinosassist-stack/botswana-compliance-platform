import app from "./worker.js";

// Cloudmersive Free Tier accepts files up to 3.5 MB. Keep this outer production
// boundary decimal-exact so requests that can never be scanned never enter R2.
const EVIDENCE_FREE_TIER_MAX_BYTES = 3_500_000;
const PRESIGN_PROBE_MAX_BYTES = 64 * 1024;
const API_TRANSPORT_PREFIX = "/__thebe_api";
const API_TUNNEL_PATH_PARAM = "__thebe_api_path";
const API_TUNNEL_QUERY_PARAM = "__thebe_api_query";
const REGISTER_TRANSPORT_PROBE_PATH = "/api/auth/register-transport-probe";
const CLIENT_RUNTIME_RELEASE = "20260906-registration-post-capability-v1";

const SAFE_LAUNCH_SCANNER_URL = "https://example.com/thebe-desk-evidence-disabled";
const SAFE_LAUNCH_SCANNER_SECRET = "thebe-desk-safe-launch-evidence-disabled-2026-09-05-9f7d2e4b";

function logicalApiPath(pathname) {
  const path = String(pathname || "");
  if (path === API_TRANSPORT_PREFIX) return "/api";
  if (path.startsWith(`${API_TRANSPORT_PREFIX}/`)) return `/api${path.slice(API_TRANSPORT_PREFIX.length)}`;
  return null;
}

function tunnelPathSegmentSafe(segment) {
  if (segment === "." || segment === "..") return false;
  try {
    const decoded = decodeURIComponent(segment);
    return decoded !== "." && decoded !== "..";
  } catch {
    return false;
  }
}

function rootTunnelApiTarget(url) {
  if (url.pathname !== "/" || !url.searchParams.has(API_TUNNEL_PATH_PARAM)) return null;
  const path = String(url.searchParams.get(API_TUNNEL_PATH_PARAM) || "");
  const query = String(url.searchParams.get(API_TUNNEL_QUERY_PARAM) || "");
  const segments = path.split("/");
  if ((path !== "/api" && !path.startsWith("/api/")) || path.length > 2048 || path.includes("?") || path.includes("#") || segments.some(segment => !tunnelPathSegmentSafe(segment)) || query.length > 8192) return null;
  const probe = new URL("https://thebe.invalid/");
  probe.pathname = path;
  if (probe.pathname !== path || (probe.pathname !== "/api" && !probe.pathname.startsWith("/api/"))) return null;
  return { path, query };
}

function normalizeApiTransport(request) {
  const url = new URL(request.url);
  const tunnel = rootTunnelApiTarget(url);
  if (tunnel) {
    url.pathname = tunnel.path;
    url.search = tunnel.query ? `?${tunnel.query}` : "";
    return { request: new Request(url.toString(), request), url, aliased: true, transport: "root_tunnel" };
  }
  const logicalPath = logicalApiPath(url.pathname);
  if (!logicalPath) return { request, url, aliased: false, transport: "direct" };
  url.pathname = logicalPath;
  return { request: new Request(url.toString(), request), url, aliased: true, transport: "shadow_path" };
}

function evidenceUploadsEnabled(env) {
  return String(env?.EVIDENCE_UPLOADS_ENABLED || "false").trim().toLowerCase() === "true";
}

function evidenceMutationDisabled(url, method) {
  if (method === "POST" && [
    "/api/evidence/presign",
    "/api/evidence/integrity-upload",
    "/api/evidence/upload"
  ].includes(url.pathname)) return true;
  if (method === "PUT" && /^\/api\/evidence\/[^/]+\/upload$/.test(url.pathname)) return true;
  return method === "POST" && /^\/api\/evidence\/[^/]+\/(complete|scan-retry)$/.test(url.pathname);
}

function readinessEnv(env) {
  return {
    ...env,
    EVIDENCE_SCAN_API_URL: SAFE_LAUNCH_SCANNER_URL,
    EVIDENCE_SCAN_SECRET: SAFE_LAUNCH_SCANNER_SECRET
  };
}

async function annotateReadinessResponse(response) {
  const headers = new Headers(response.headers);
  const type = String(headers.get("content-type") || "").toLowerCase();
  if (!type.includes("application/json")) return response;
  let data;
  try { data = await response.clone().json(); } catch { return response; }
  if (data && typeof data === "object") {
    data.evidenceUploadsEnabled = false;
    data.evidenceScannerRequired = false;
    if (Array.isArray(data.checks)) {
      data.checks = data.checks.map(check => {
        if (check?.key === "EVIDENCE_SCAN_API_URL" || check?.key === "EVIDENCE_SCAN_SECRET") {
          return { ...check, required: false, configured: false, purpose: "disabled for safe launch while evidence uploads are unavailable" };
        }
        return check;
      });
      data.missingRequired = data.checks.filter(x => x.required && !x.configured).map(x => x.key);
      data.ready = data.missingRequired.length === 0;
    }
  }
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

function jsonError(error, status, extra = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin"
    }
  });
}

function jsonOk(data = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-thebe-client-release": CLIENT_RUNTIME_RELEASE
    }
  });
}

function registrationProbeOriginAllowed(request, url) {
  const origin = String(request.headers.get("origin") || "").trim();
  if (!origin) return true;
  try { return new URL(origin).origin === url.origin; } catch { return false; }
}

async function versionRuntimeResponse(response, request, url) {
  const headers = new Headers(response.headers);
  if (url.pathname === "/js/api-client.js" && ["GET", "HEAD"].includes(request.method)) {
    headers.set("cache-control", "no-store, max-age=0");
    headers.set("cdn-cache-control", "no-store");
    headers.set("x-thebe-client-release", CLIENT_RUNTIME_RELEASE);
    return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
  }
  if (url.pathname !== "/" || !["GET", "HEAD"].includes(request.method)) return response;
  const type = String(headers.get("content-type") || "").toLowerCase();
  if (!type.includes("text/html")) return response;
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("cdn-cache-control", "no-store");
  headers.set("x-thebe-client-release", CLIENT_RUNTIME_RELEASE);
  if (request.method === "HEAD") return new Response(null, { status: response.status, statusText: response.statusText, headers });
  const html = await response.text();
  const versioned = html
    .replaceAll('src="js/api-client.js"', `src="js/api-client.js?v=${CLIENT_RUNTIME_RELEASE}"`)
    .replaceAll('src="/js/api-client.js"', `src="/js/api-client.js?v=${CLIENT_RUNTIME_RELEASE}"`);
  return new Response(versioned, { status: response.status, statusText: response.statusText, headers });
}

async function bodyWithinLimit(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) return false;
  if (!request.body) return true;
  const reader = request.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel("file_too_large"); } catch {}
        return false;
      }
    }
    return true;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

async function presignWithinLimit(request) {
  const probe = request.clone();
  const declared = Number(probe.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > PRESIGN_PROBE_MAX_BYTES) return { ok: false, status: 413, error: "request_too_large" };
  if (!(await bodyWithinLimit(probe.clone(), PRESIGN_PROBE_MAX_BYTES))) return { ok: false, status: 413, error: "request_too_large" };
  let body;
  try { body = await probe.json(); } catch { return { ok: true }; }
  const size = Number(body?.size || 0);
  if (Number.isFinite(size) && size > EVIDENCE_FREE_TIER_MAX_BYTES) {
    return { ok: false, status: 400, error: "file_size_not_allowed" };
  }
  return { ok: true };
}

function isEvidenceByteUpload(url, method) {
  if (method === "POST" && (url.pathname === "/api/evidence/integrity-upload" || url.pathname === "/api/evidence/upload")) return true;
  return method === "PUT" && /^\/api\/evidence\/[^/]+\/upload$/.test(url.pathname);
}

export default {
  async fetch(incomingRequest, env, ctx) {
    const normalized = normalizeApiTransport(incomingRequest);
    const request = normalized.request;
    const url = normalized.url;
    const uploadsEnabled = evidenceUploadsEnabled(env);

    if (request.method === "POST" && url.pathname === REGISTER_TRANSPORT_PROBE_PATH) {
      if (!registrationProbeOriginAllowed(request, url)) return jsonError("origin_failed", 403);
      return jsonOk({ ok: true, transport: normalized.transport, release: CLIENT_RUNTIME_RELEASE });
    }

    if (!uploadsEnabled && evidenceMutationDisabled(url, request.method)) {
      return jsonError("evidence_uploads_temporarily_disabled", 503, { evidenceUploadsEnabled: false });
    }

    if (!uploadsEnabled && ["GET", "HEAD"].includes(request.method) && url.pathname === "/api/ready") {
      return annotateReadinessResponse(await app.fetch(request, readinessEnv(env), ctx));
    }

    if (!uploadsEnabled && request.method === "GET" && url.pathname === "/api/platform/deployment-readiness") {
      return annotateReadinessResponse(await app.fetch(request, readinessEnv(env), ctx));
    }

    if (uploadsEnabled && request.method === "POST" && url.pathname === "/api/evidence/presign") {
      const result = await presignWithinLimit(request);
      if (!result.ok) return jsonError(result.error, result.status, { maxBytes: EVIDENCE_FREE_TIER_MAX_BYTES });
    }
    if (uploadsEnabled && isEvidenceByteUpload(url, request.method)) {
      const probe = request.clone();
      if (!(await bodyWithinLimit(probe, EVIDENCE_FREE_TIER_MAX_BYTES))) {
        return jsonError("file_too_large", 413, { maxBytes: EVIDENCE_FREE_TIER_MAX_BYTES });
      }
    }
    const response = await app.fetch(request, env, ctx);
    return versionRuntimeResponse(response, request, url);
  },
  async scheduled(event, env, ctx) {
    return app.scheduled(event, env, ctx);
  }
};

export const __cloudmersiveFreeTierTest = Object.freeze({
  EVIDENCE_FREE_TIER_MAX_BYTES,
  API_TRANSPORT_PREFIX,
  API_TUNNEL_PATH_PARAM,
  API_TUNNEL_QUERY_PARAM,
  REGISTER_TRANSPORT_PROBE_PATH,
  CLIENT_RUNTIME_RELEASE,
  logicalApiPath,
  rootTunnelApiTarget,
  normalizeApiTransport,
  isEvidenceByteUpload,
  evidenceUploadsEnabled,
  evidenceMutationDisabled,
  registrationProbeOriginAllowed,
  versionRuntimeResponse
});
