const API = 'https://api.cloudflare.com/client/v4';

const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const databaseId = String(process.env.D1_DATABASE_ID || '').trim();
const workerName = String(process.env.CLOUDFLARE_WORKER_NAME || 'bw-compliance-os').trim();
const bucketName = String(process.env.CLOUDFLARE_R2_BUCKET || 'bw-compliance-evidence').trim();
const publicAppUrl = String(process.env.PUBLIC_APP_URL || 'https://thebedesk.com').trim().replace(/\/+$/, '');

function fail(message) {
  console.error(`Cloudflare authorization diagnostic failed: ${message}`);
  process.exit(1);
}

if (!token) fail('CLOUDFLARE_API_TOKEN is empty');
if (!/^[0-9a-fA-F]{32}$/.test(accountId)) fail('CLOUDFLARE_ACCOUNT_ID is not a 32-character account identifier');
if (!/^[0-9a-fA-F-]{36}$/.test(databaseId)) fail('D1_DATABASE_ID is not a UUID');

const tokenClass = token.startsWith('cfut_')
  ? 'user API token'
  : token.startsWith('cfat_')
    ? 'account API token'
    : 'legacy/unknown API token format';
console.log(`Cloudflare credential class: ${tokenClass}`);

function summarizeErrors(body) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  if (!errors.length) return 'none';
  return errors
    .map(error => {
      const code = error?.code ?? 'unknown';
      const message = String(error?.message || 'unknown error').replace(/\s+/g, ' ').slice(0, 220);
      return `${code}:${message}`;
    })
    .join(' | ');
}

async function probe(label, path) {
  let response;
  let body = null;
  try {
    response = await fetch(`${API}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    const text = await response.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
  } catch (error) {
    console.log(`${label}: network_error=${String(error?.message || error).slice(0, 220)}`);
    return {label, ok: false, status: 0, errors: 'network error'};
  }

  const apiSuccess = body?.success;
  const errors = summarizeErrors(body);
  const workerMissingBeforeFirstDeploy =
    label === 'Worker service metadata' &&
    response.status === 404 &&
    errors.includes('10090:This Worker does not exist on this account.');
  const ok = (response.ok && apiSuccess !== false) || workerMissingBeforeFirstDeploy;
  const state = workerMissingBeforeFirstDeploy ? ' allowed_first_deploy_absence=true' : '';
  console.log(`${label}: HTTP ${response.status} api_success=${apiSuccess === undefined ? 'unknown' : String(apiSuccess)} errors=${errors}${state}`);
  return {label, ok, status: response.status, errors, body, workerMissingBeforeFirstDeploy};
}

function safeEdgeBody(text) {
  return String(text || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 600);
}

async function probePublicEdge(path) {
  try {
    const response = await fetch(`${publicAppUrl}${path}`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ThebeDesk-Production-Diagnostic/1.0'
      }
    });
    const text = await response.text();
    const fingerprint = {
      status: response.status,
      server: response.headers.get('server') || '',
      cfRay: response.headers.get('cf-ray') || '',
      cfMitigated: response.headers.get('cf-mitigated') || '',
      contentType: response.headers.get('content-type') || '',
      cacheStatus: response.headers.get('cf-cache-status') || '',
      location: response.headers.get('location') || '',
      body: safeEdgeBody(text)
    };
    const challengeLike =
      String(fingerprint.cfMitigated).toLowerCase() === 'challenge' ||
      /cloudflare|attention required|just a moment|access denied|forbidden|challenge-platform/i.test(fingerprint.body);
    console.log(`Public edge ${path} fingerprint: ${JSON.stringify({...fingerprint, challengeLike})}`);
    return {ok: response.ok, ...fingerprint, challengeLike};
  } catch (error) {
    console.log(`Public edge ${path} fingerprint: network_error=${String(error?.message || error).slice(0, 220)}`);
    return {ok: false, status: 0, challengeLike: false};
  }
}

const verifyPath = token.startsWith('cfat_')
  ? `/accounts/${accountId}/tokens/verify`
  : '/user/tokens/verify';

const probes = [];
probes.push(await probe('token verification', verifyPath));
probes.push(await probe('account scope', `/accounts/${accountId}`));
probes.push(await probe('Worker service metadata', `/accounts/${accountId}/workers/services/${encodeURIComponent(workerName)}`));
probes.push(await probe('D1 binding', `/accounts/${accountId}/d1/database/${encodeURIComponent(databaseId)}`));
probes.push(await probe('R2 binding', `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}`));
probes.push(await probe('Workers AI binding', `/accounts/${accountId}/ai/models/search?per_page=1`));
probes.push(await probe('Workers custom-domain visibility', `/accounts/${accountId}/workers/domains`));

const failed = probes.filter(item => !item.ok);
if (failed.length) {
  console.error('Cloudflare authorization diagnostic summary:');
  for (const item of failed) {
    console.error(`- ${item.label}: HTTP ${item.status}; ${item.errors}`);
  }
  const workerFailure = failed.find(item => item.label === 'Worker service metadata');
  if (workerFailure?.errors.includes('10000')) {
    console.error('The token is valid but Cloudflare is denying the exact Worker service metadata endpoint that Wrangler reads before upload. Check the token resource scope and Workers Scripts authorization for this exact account.');
  }
  process.exit(2);
}

await probePublicEdge('/api/live');
await probePublicEdge('/api/ready');
await probePublicEdge('/api/auth/anti-bot-config');

const firstDeploy = probes.find(item => item.workerMissingBeforeFirstDeploy);
if (firstDeploy) {
  console.log(`Cloudflare authorization diagnostic passed: token, account, D1, R2, Workers AI, and Worker-domain reads are authorized; Worker ${workerName} is absent and may be created by this first deployment.`);
} else {
  console.log('Cloudflare authorization diagnostic passed: token, account, Worker service, D1, R2, Workers AI, and Worker-domain reads are authorized.');
}
