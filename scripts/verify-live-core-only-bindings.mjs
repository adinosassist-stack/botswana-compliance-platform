// Production post-deploy, read-only check. Never mutates Worker settings or logs bindings.
import {pathToFileURL} from 'node:url';

const REQUIRED = Object.freeze({
  APP_ENV: 'production',
  PAYMENT_PROVIDER: 'none',
  POP_UPLOAD_STAGING_ENABLED: 'false',
  THEBE_AI_EXPORTS_ENABLED: 'false',
  THEBE_GENERAL_AI_ENABLED: 'false',
});

export function verifyLiveCoreOnlyBindings(payload) {
  if (payload?.success !== true || !Array.isArray(payload?.result?.bindings)) {
    throw Error('live_core_bindings_unavailable');
  }
  const bindings = payload.result.bindings;
  for (const [name, expected] of Object.entries(REQUIRED)) {
    const matching = bindings.filter(entry => entry?.name === name);
    if (matching.length !== 1 || matching[0].type !== 'plain_text' || matching[0].text !== expected) {
      throw Error('live_core_bindings_mismatch_' + name);
    }
  }
  return {kind: 'live_core_bindings_verified', production: true, popIngestionEnabled: false,
    advancedAiExportsEnabled: false, generalAiEnabled: false, paymentProvider: 'none'};
}

export async function readAndVerifyLiveCoreOnlyBindings({accountId, token, fetchImpl = fetch}) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '') || typeof token !== 'string' || !token) {
    throw Error('live_core_bindings_credentials_missing');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/bw-compliance-os/settings`;
  const response = await fetchImpl(url, {
    method: 'GET', redirect: 'error',
    headers: {'Authorization': `Bearer ${token}`, 'Accept': 'application/json'},
    signal: AbortSignal.timeout(12000),
  });
  if (!response?.ok) throw Error('live_core_bindings_read_failed');
  const body = await response.text();
  if (body.length > 524288) throw Error('live_core_bindings_response_oversize');
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw Error('live_core_bindings_invalid_json'); }
  return verifyLiveCoreOnlyBindings(parsed);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await readAndVerifyLiveCoreOnlyBindings({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch {
    // Deliberately avoid exposing token-bearing HTTP errors or provider response bodies.
    console.error('live_core_bindings_hold');
    process.exitCode = 1;
  }
}
