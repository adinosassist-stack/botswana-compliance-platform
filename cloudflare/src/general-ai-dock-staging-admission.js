import {createAccessProtectedGateway} from "../../server/quotation-commercial-staging-gateway.mjs";

const rekey = `UPDATE sessions SET token_hash=?
  WHERE token_hash=? AND user_id=? AND tenant_id=? AND role='owner'
    AND expires_at>CURRENT_TIMESTAMP AND expires_at<=datetime('now','+15 minutes')
    AND EXISTS (
      SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id
      WHERE u.id=sessions.user_id AND m.tenant_id=sessions.tenant_id
        AND m.status='active' AND m.role='owner'
        AND u.email LIKE '%@%.invalid'
        AND u.session_generation=sessions.session_generation
    )
  RETURNING expires_at`;

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// The caller must verify Cloudflare Access and same-origin admission before exchange.
export async function exchangeDockStagingInvitation(env, ticket) {
  const {DB, SESSION_SECRET, DOCK_RESEARCH_FIXTURE_USER_ID: user,
    DOCK_RESEARCH_FIXTURE_TENANT_ID: tenant} = env ?? {};
  if (env?.APP_ENV !== 'staging' || env?.DOCK_STAGING_ADMISSION_ENABLED !== 'true' ||
      !/^dock-test-[a-f0-9]{64}$/.test(ticket ?? '') ||
      !/^dock-fixture-[a-f0-9]{32}-user$/.test(user ?? '') ||
      tenant !== user.replace(/-user$/, '-tenant') ||
      typeof SESSION_SECRET !== 'string' || SESSION_SECRET.length < 32 || !DB) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(SESSION_SECRET),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const hash = async value => hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
  const cookie = hex(crypto.getRandomValues(new Uint8Array(32)));
  const row = await DB.prepare(rekey).bind(await hash(cookie), await hash(ticket), user, tenant).first();
  const expiresAt = Date.parse(String(row?.expires_at).replace(' ', 'T') + 'Z');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {cookie, expiresAt};
}

function respond(body, status, extra = {}) {
  return new Response(body, {status, headers: {
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  }});
}

export async function handleDockStagingAdmission(request, env) {
  const origin = env.DOCK_STAGING_WORKSPACE_ORIGIN;
  if (env.APP_ENV !== 'staging' || env.DOCK_STAGING_ADMISSION_ENABLED !== 'true' ||
      origin !== 'https://dock-staging.thebedesk.com') return respond(null, 404);

  try {
    const gateway = createAccessProtectedGateway({
      workspaceOrigin: origin,
      teamOrigin: env.DOCK_STAGING_ACCESS_TEAM_ORIGIN,
      audience: env.DOCK_STAGING_ACCESS_AUD,
      forward: async verified => {
        if (verified.method === 'GET') {
          return respond('<!doctype html><title>Dock staging sign-in</title><h1>Dock staging sign-in</h1><form method="post"><label>Invitation <input type="password" name="ticket" required maxlength="74"></label><button>Sign in</button></form>', 200, {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
            'referrer-policy': 'same-origin',
          });
        }
        if (verified.method !== 'POST' || verified.headers.get('origin') !== origin ||
            verified.headers.get('sec-fetch-site') !== 'same-origin' ||
            verified.headers.get('content-type') !== 'application/x-www-form-urlencoded') return respond(null, 403);
        const reader = verified.body?.getReader();
        if (!reader) return respond(null, 400);
        const decoder = new TextDecoder();
        let size = 0;
        let form = '';
        try {
          while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 512) return respond(null, 413);
            form += decoder.decode(value, {stream: true});
          }
          form += decoder.decode();
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const tickets = new URLSearchParams(form).getAll('ticket');
        const session = tickets.length === 1 ? await exchangeDockStagingInvitation(env, tickets[0]) : null;
        if (!session) return respond('Invitation invalid or expired.', 401);
        return respond(null, 303, {
          location: '/app/',
          'set-cookie': '__Host-bw_session=' + session.cookie + '; Path=/; Secure; HttpOnly; SameSite=Strict; Expires=' +
            new Date(session.expiresAt).toUTCString(),
        });
      },
    });
    return await gateway.fetch(request);
  } catch {
    return respond(null, 404);
  }
}
